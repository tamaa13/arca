/**
 * OAuth 2.1 authorization-server + resource-server state for the hosted Arca MCP.
 *
 * WHY this exists (and what it is NOT):
 *   Claude.ai / ChatGPT web custom-connectors only authenticate via OAuth redirect —
 *   there is no field to paste a bearer token. So we expose a standard OAuth 2.1 AS
 *   (DCR + PKCE-S256 + audience-bound tokens + refresh rotation) IN FRONT of the
 *   existing wallet-sign session flow.
 *
 *   Arca's memory key + session-signer are DETERMINISTICALLY derived from the user's
 *   wallet EIP-712 signature (see wallet/sig-key.ts) — OAuth cannot and does not
 *   replace that. The OAuth `/authorize` page IS the dashboard's connect+sign flow;
 *   after the user signs we `createSession(...)` (the SAME deterministic UserSession)
 *   and bind an OAuth auth-code → that session's bearer token. The minted OAuth
 *   access token therefore resolves straight back to a `UserSession` (see
 *   `validateAccessToken` → `sessionForToken`). No token passthrough: Arca uses its
 *   OWN session-signer for 0G; the client's OAuth token is never forwarded anywhere.
 *
 * Storage is in-memory (Maps), mirroring sessions.ts — a restart drops OAuth state
 * (the client re-runs the redirect; the underlying wallet session is re-derivable).
 *
 * Security posture baked in here:
 *   - DCR (RFC 7591): public clients use PKCE + token_endpoint_auth_method "none";
 *     a client_secret is issued only for confidential auth methods.
 *   - PKCE S256 MANDATORY — `plain` is rejected.
 *   - Auth codes: random ≥32B, single-use, 60s TTL, bound to
 *     client_id + redirect_uri + code_challenge + sessionToken + resource + scope.
 *   - Access tokens: 1h TTL, audience-bound to the canonical MCP resource;
 *     validateAccessToken rejects expired tokens AND tokens whose audience ≠ ours.
 *   - Refresh tokens rotate: the presented refresh token is invalidated on use.
 *   - All opaque values from crypto.randomBytes (≥32B), base64url-encoded.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

// ── encoding helpers ─────────────────────────────────────────────────────────
const b64url = (b: Buffer): string => b.toString("base64url");
/** A fresh opaque token: `bytes` of CSPRNG entropy, base64url (no padding). */
const opaque = (bytes = 32): string => b64url(randomBytes(bytes));

const SCOPES_SUPPORTED = ["arca.memory", "offline_access"] as const;
/** Resource-server scope set — what the protected MCP resource itself advertises.
 *  `offline_access` is an AS-only grant concept (it gates refresh tokens), NOT a
 *  capability of the resource, so the PR metadata advertises only `arca.memory`. */
const RESOURCE_SCOPES_SUPPORTED = ["arca.memory"] as const;
const DEFAULT_SCOPE = "arca.memory";

const AUTH_CODE_TTL_MS = 60_000; // 60s — short, single-use
const ACCESS_TTL_S = 3600; // 1h
const ACCESS_TTL_MS = ACCESS_TTL_S * 1000;

/** Bound the DCR client table (an open registration endpoint is a memory-DoS vector).
 *  At cap we evict the oldest client; the sweep also TTLs clients out after 24h. */
const MAX_CLIENTS = 10_000;
const CLIENT_TTL_S = 24 * 3600; // 24h since issued (epoch-seconds basis)

// ── client registry (Dynamic Client Registration, RFC 7591) ──────────────────
export interface OAuthClient {
  client_id: string;
  client_secret?: string; // only for confidential clients
  client_id_issued_at: number; // epoch seconds
  client_name?: string;
  redirect_uris: string[];
  grant_types: string[];
  response_types: string[];
  token_endpoint_auth_method: string; // "none" (public/PKCE) | "client_secret_post"
  scope?: string;
}

export interface RegisterClientInput {
  client_name?: string;
  redirect_uris: string[];
  grant_types?: string[];
  response_types?: string[];
  token_endpoint_auth_method?: string;
  scope?: string;
}

const clients = new Map<string, OAuthClient>();

// Persist the DCR client registry to disk so web connectors (claude.ai/ChatGPT) survive a
// server restart/redeploy WITHOUT the user re-adding the connector. Client records are NOT
// secrets (client_id + redirect_uris + metadata; Arca is PKCE-only, no client_secret), so this
// is safe on a shared host — unlike wallet sessions, which hold the memory key and stay in-memory.
const CLIENTS_FILE = process.env.ARCA_CLIENTS_FILE;
function saveClients(): void {
  if (!CLIENTS_FILE) return;
  try {
    writeFileSync(CLIENTS_FILE, JSON.stringify([...clients.values()]));
  } catch (err) {
    console.error("[oauth] persist clients failed:", err instanceof Error ? err.message : err);
  }
}
/** Load persisted client registrations at startup (call once, before serving). TTL-filtered. */
export function loadClients(): void {
  if (!CLIENTS_FILE) return;
  try {
    const arr = JSON.parse(readFileSync(CLIENTS_FILE, "utf8")) as OAuthClient[];
    const now = Math.floor(Date.now() / 1000);
    for (const c of arr) {
      if (c?.client_id && now - c.client_id_issued_at < CLIENT_TTL_S) clients.set(c.client_id, c);
    }
    console.error(`[oauth] loaded ${clients.size} persisted client(s)`);
  } catch {
    /* no file yet / unreadable — start empty */
  }
}

/**
 * Register a client (RFC 7591). Arca is **PKCE-only**: every client is public
 * (`token_endpoint_auth_method: "none"`) and NO client_secret is ever issued. PKCE-S256
 * is the sole client proof. (A secret on a public-by-design AS that we'd never verify
 * is security theater — that was the audited bug; we removed confidential support
 * entirely. Claude.ai / ChatGPT web connectors are public clients, so nothing is lost.)
 */
export function registerClient(input: RegisterClientInput): OAuthClient {
  // Bound the table: at cap, evict the oldest client (smallest issued_at) before insert.
  if (clients.size >= MAX_CLIENTS) {
    let oldestKey: string | undefined;
    let oldestAt = Infinity;
    for (const [k, c] of clients) {
      if (c.client_id_issued_at < oldestAt) {
        oldestAt = c.client_id_issued_at;
        oldestKey = k;
      }
    }
    if (oldestKey) clients.delete(oldestKey);
  }
  const client: OAuthClient = {
    client_id: opaque(24),
    client_id_issued_at: Math.floor(Date.now() / 1000),
    client_name: input.client_name,
    redirect_uris: input.redirect_uris,
    grant_types: input.grant_types?.length ? input.grant_types : ["authorization_code", "refresh_token"],
    response_types: input.response_types?.length ? input.response_types : ["code"],
    token_endpoint_auth_method: "none",
    scope: input.scope ?? SCOPES_SUPPORTED.join(" "),
  };
  clients.set(client.client_id, client);
  saveClients();
  return client;
}

export function getClient(client_id: string): OAuthClient | undefined {
  return clients.get(client_id);
}

// ── auth-code store ───────────────────────────────────────────────────────────
interface AuthCodeRecord {
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  code_challenge_method: string;
  sessionToken: string; // the UserSession bearer this code resolves to
  resource?: string;
  scope?: string;
  expiresAt: number; // epoch ms
  used: boolean;
}

const authCodes = new Map<string, AuthCodeRecord>();

export interface MintAuthCodeInput {
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  code_challenge_method: string;
  sessionToken: string;
  resource?: string;
  scope?: string;
}

/** Mint a single-use, 60s auth code bound to all the PKCE/session fields. */
export function mintAuthCode(input: MintAuthCodeInput): string {
  const code = opaque(32);
  authCodes.set(code, {
    client_id: input.client_id,
    redirect_uri: input.redirect_uri,
    code_challenge: input.code_challenge,
    code_challenge_method: input.code_challenge_method,
    sessionToken: input.sessionToken,
    resource: input.resource,
    scope: input.scope,
    expiresAt: Date.now() + AUTH_CODE_TTL_MS,
    used: false,
  });
  return code;
}

/**
 * Consume an auth code: returns the record exactly once. Rejects (returns null) if
 * the code is unknown, already used, or expired. On a valid hit it marks the code
 * used and deletes it (single-use, replay-proof).
 */
export function consumeAuthCode(code: string): AuthCodeRecord | null {
  const rec = authCodes.get(code);
  if (!rec) return null;
  if (rec.used || Date.now() > rec.expiresAt) {
    authCodes.delete(code);
    return null;
  }
  rec.used = true;
  authCodes.delete(code);
  return rec;
}

// ── access / refresh token store ──────────────────────────────────────────────
const REFRESH_FAMILY_TTL_MS = 30 * 24 * 3600_000; // absolute 30-day refresh lifetime

interface AccessTokenRecord {
  sessionToken: string;
  client_id: string;
  audience: string; // the canonical MCP resource URI this token is valid for
  scope?: string;
  family: string; // rotation family — shared across a refresh chain
  expiresAt: number; // epoch ms
}

interface RefreshTokenRecord {
  sessionToken: string;
  client_id: string;
  resource: string; // canonical audience (always the server's own /mcp)
  scope?: string;
  family: string;
  familyExpiresAt: number; // epoch ms — absolute lifetime of the rotation chain
}

const accessTokens = new Map<string, AccessTokenRecord>();
const refreshTokens = new Map<string, RefreshTokenRecord>();
/** Reuse detection: a rotated (already-consumed) refresh token → its family id (+ the
 *  family's absolute expiry, so the sweep can evict it). Presenting one again is a theft
 *  signal → the whole family is revoked (OAuth 2.1 §4.3.1). */
const consumedRefresh = new Map<string, { family: string; expiresAt: number }>();

export interface TokenResponse {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
  scope: string;
}

export interface IssueTokensInput {
  sessionToken: string;
  client_id: string;
  resource: string; // audience the access token is bound to (canonical MCP resource)
  scope?: string;
  family?: string; // continue an existing rotation family (set on refresh)
  familyExpiresAt?: number;
}

/** A fresh rotation-family id. Exposed so the resource server can mint the family up front
 *  and bind an OAuth web-connector row to it (see registerOauthConnector) at token issuance. */
export function newFamily(): string {
  return opaque(16);
}

/** Revoke every access+refresh token in a rotation family (theft / reuse response). */
export function revokeFamily(family: string): void {
  for (const [t, r] of accessTokens) if (r.family === family) accessTokens.delete(t);
  for (const [t, r] of refreshTokens) if (r.family === family) refreshTokens.delete(t);
}

/** Issue a fresh access+refresh pair. Access token is audience-bound to `resource`. */
export function issueTokens(input: IssueTokensInput): TokenResponse {
  const access_token = opaque(32);
  const refresh_token = opaque(32);
  const scope = input.scope ?? DEFAULT_SCOPE;
  const family = input.family ?? opaque(16);
  const familyExpiresAt = input.familyExpiresAt ?? Date.now() + REFRESH_FAMILY_TTL_MS;

  accessTokens.set(access_token, {
    sessionToken: input.sessionToken,
    client_id: input.client_id,
    audience: input.resource,
    scope,
    family,
    expiresAt: Date.now() + ACCESS_TTL_MS,
  });
  refreshTokens.set(refresh_token, {
    sessionToken: input.sessionToken,
    client_id: input.client_id,
    resource: input.resource,
    scope,
    family,
    familyExpiresAt,
  });

  return { access_token, token_type: "Bearer", expires_in: ACCESS_TTL_S, refresh_token, scope };
}

/**
 * Rotate a refresh token (OAuth 2.1 §4.3.1 for public clients): the presented token is
 * invalidated and a new access+refresh pair issued. Hardened:
 *   - Reuse detection: presenting an already-rotated refresh token revokes the ENTIRE
 *     family (all access+refresh tokens in the chain) — a stolen token can't be redeemed
 *     after the legit client rotates, and the theft revokes everything.
 *   - Absolute family lifetime (30d): the chain can't live forever.
 * Returns null (→ invalid_grant) if unknown, wrong client, reused, or expired.
 */
export function rotateRefresh(refresh_token: string, client_id: string): TokenResponse | null {
  const reused = consumedRefresh.get(refresh_token);
  if (reused) {
    revokeFamily(reused.family); // theft signal — burn the whole chain
    return null;
  }
  const rec = refreshTokens.get(refresh_token);
  if (!rec || rec.client_id !== client_id) return null;
  if (Date.now() > rec.familyExpiresAt) {
    revokeFamily(rec.family);
    return null;
  }
  refreshTokens.delete(refresh_token);
  consumedRefresh.set(refresh_token, { family: rec.family, expiresAt: rec.familyExpiresAt }); // remember for reuse detection
  return issueTokens({
    sessionToken: rec.sessionToken,
    client_id: rec.client_id,
    resource: rec.resource,
    scope: rec.scope,
    family: rec.family,
    familyExpiresAt: rec.familyExpiresAt,
  });
}

// ── PKCE ──────────────────────────────────────────────────────────────────────
/**
 * Verify a PKCE code_verifier against a stored code_challenge. ONLY S256 is allowed
 * (`plain` is rejected): base64url(SHA256(code_verifier)) must equal code_challenge,
 * compared in constant time.
 */
export function verifyPkce(
  code_verifier: string | undefined,
  code_challenge: string,
  method: string,
): boolean {
  if (!code_verifier) return false;
  if (method !== "S256") return false; // reject `plain` and anything else
  const computed = b64url(createHash("sha256").update(code_verifier).digest());
  const a = Buffer.from(computed);
  const b = Buffer.from(code_challenge);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// ── resource-server: access-token validation ──────────────────────────────────
/**
 * Validate an OAuth access token for `expectedAudience` (the canonical MCP resource
 * URI). Returns the bound UserSession bearer token when the token exists, is not
 * expired, AND its audience matches — so the caller does `sessionForToken(...)` to
 * get the per-user store. Returns null otherwise (unknown / expired / wrong audience).
 */
export function validateAccessToken(token: string, expectedAudience: string): string | null {
  const rec = accessTokens.get(token);
  if (!rec) return null;
  if (Date.now() > rec.expiresAt) {
    accessTokens.delete(token);
    return null;
  }
  if (rec.audience !== expectedAudience) return null; // audience-bound: no cross-resource reuse
  return rec.sessionToken;
}

// ── discovery metadata builders ───────────────────────────────────────────────
/** RFC 9728 — protected-resource metadata (points clients at the AS). */
export function protectedResourceMetadata(baseUrl: string) {
  return {
    resource: `${baseUrl}/mcp`,
    authorization_servers: [baseUrl],
    scopes_supported: [...RESOURCE_SCOPES_SUPPORTED],
    bearer_methods_supported: ["header"],
  };
}

// ── authorize→approve browser binding (anti session-fixation) ─────────────────
/**
 * GET /authorize sets an HttpOnly cookie carrying one of these nonces; POST
 * /authorize/approve must present it back AND match the same client_id+code_challenge.
 * This binds the consent (wallet sign) to the browser that started the flow, so an
 * attacker who merely knows the in-flight code_challenge can't mint a code bound to
 * THEIR vault for a victim's client (login/session-fixation). 10-min TTL.
 */
interface AuthzNonceRecord {
  client_id: string;
  code_challenge: string;
  expiresAt: number;
}
const authzNonces = new Map<string, AuthzNonceRecord>();
const AUTHZ_NONCE_TTL_MS = 600_000; // 10 min

export function mintAuthzNonce(client_id: string, code_challenge: string): string {
  const nonce = opaque(24);
  authzNonces.set(nonce, { client_id, code_challenge, expiresAt: Date.now() + AUTHZ_NONCE_TTL_MS });
  return nonce;
}

/** True iff the nonce exists, is unexpired, and matches THIS client_id + code_challenge. */
export function checkAuthzNonce(
  nonce: string | undefined,
  client_id: string,
  code_challenge: string,
): boolean {
  if (!nonce) return false;
  const rec = authzNonces.get(nonce);
  if (!rec || Date.now() > rec.expiresAt) {
    if (rec) authzNonces.delete(nonce);
    return false;
  }
  const match = rec.client_id === client_id && rec.code_challenge === code_challenge;
  // Single-use: a nonce redeems EXACTLY ONE approve (each GET /authorize → one code).
  if (match) authzNonces.delete(nonce);
  return match;
}

// ── periodic sweep (bound the in-memory Maps; open DCR could otherwise grow them) ──
function sweep(): void {
  const now = Date.now();
  const nowS = Math.floor(now / 1000);
  for (const [k, r] of authCodes) if (now > r.expiresAt) authCodes.delete(k);
  for (const [k, r] of accessTokens) if (now > r.expiresAt) accessTokens.delete(k);
  for (const [k, r] of refreshTokens) if (now > r.familyExpiresAt) refreshTokens.delete(k);
  for (const [k, r] of authzNonces) if (now > r.expiresAt) authzNonces.delete(k);
  for (const [k, r] of consumedRefresh) if (now > r.expiresAt) consumedRefresh.delete(k);
  // TTL DCR clients out after CLIENT_TTL_S (bounds the table even below MAX_CLIENTS).
  let prunedClients = false;
  for (const [k, c] of clients) if (nowS - c.client_id_issued_at > CLIENT_TTL_S) { clients.delete(k); prunedClients = true; }
  if (prunedClients) saveClients(); // keep the persisted file in sync after a TTL prune
}

/** Start the periodic sweep (call once at startup). Unref'd so it never holds the event loop. */
export function startOauthSweep(intervalMs = 300_000): void {
  const t = setInterval(sweep, intervalMs);
  if (typeof t.unref === "function") t.unref();
}

/** RFC 8414 — authorization-server metadata. */
export function authServerMetadata(baseUrl: string) {
  return {
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/authorize`,
    token_endpoint: `${baseUrl}/token`,
    registration_endpoint: `${baseUrl}/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: [...SCOPES_SUPPORTED],
  };
}
