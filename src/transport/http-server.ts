/**
 * Arca MCP — remote transport (Streamable HTTP), PER-USER.
 *
 * One hosted URL every agent platform connects to (Claude Code/web, ChatGPT,
 * Cursor, Copilot, OpenCode, Antigravity; Codex via the mcp-remote bridge).
 *
 * Auth + multi-tenant (Phase 1b):
 *   - POST /session  {wallet, signature}  → the dashboard calls this after the
 *     user signs the Arca EIP-712. We verify ownership, derive the memory key,
 *     mint a session-signer, and return a bearer token + the signer address to
 *     fund/delegate.
 *   - Every MCP request carries `Authorization: Bearer <token>`. We resolve it to
 *     the user's session and bind a per-user RemoteMemoryStore (wallet-keyed,
 *     delegate-anchored) to that MCP session — so each user reads/writes only
 *     their own vault.
 *   - ARCA_BEARER (optional) keeps the single-user LOCAL key path for dev.
 *
 * NOT operator-blind yet: the key is derived in this process, not a TEE (1c).
 * Run: ARCA_RPC=…testnet ARCA_INDEXER=…testnet ARCA_CHAIN_ID=16602 \
 *      ARCA_REGISTRY_ADDR=0xc196… bun src/transport/http-server.ts
 */
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type Request, type Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { buildArcaServer, buildStore } from "../mcp/build-server.js";
import { RemoteMemoryStore } from "../memory/remote-store.js";
import { OgStorageClient } from "../og/storage.js";
import { RegistryClient } from "../registry/client.js";
import { keyedCrypto } from "../wallet/sig-key.js";
import { createSession, sessionForToken, type UserSession } from "../auth/sessions.js";
import {
  registerClient,
  getClient,
  mintAuthCode,
  consumeAuthCode,
  issueTokens,
  rotateRefresh,
  verifyPkce,
  validateAccessToken,
  protectedResourceMetadata,
  authServerMetadata,
  mintAuthzNonce,
  checkAuthzNonce,
  startOauthSweep,
  loadClients,
} from "../auth/oauth.js";
import { generateBootstrapKeypair, decryptWithPrivkey, type HandoffEnvelope } from "../sandbox/handoff.js";
import { OG, type MemoryStore } from "../types.js";

const PORT = Number(process.env.ARCA_PORT ?? 8787);
const BEARER = process.env.ARCA_BEARER ?? ""; // optional dev single-user (local key)
const PUBLIC_URL = process.env.ARCA_PUBLIC_URL ?? `http://localhost:${PORT}`;
const MCP_PATH = "/mcp";

/** Is a host (possibly `host:port`) a loopback/dev host (http allowed)? */
function isLocalHost(host: string | undefined): boolean {
  const h = (host ?? "").split(":")[0].toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h === "::1";
}

/** The public base URL (no trailing slash). ARCA_PUBLIC_URL wins; else derive from the
 *  request (the 0G Sandbox nip.io host when deployed). For any NON-localhost host we FORCE
 *  https — behind cloudflared/tailscale the inbound is TLS-terminated, and the AS/PR
 *  discovery + WWW-Authenticate issuer must NEVER advertise an http:// origin to a web
 *  client (it would be rejected / a downgrade vector). localhost stays http for dev. */
function baseUrlOf(req: Request): string {
  if (process.env.ARCA_PUBLIC_URL) return process.env.ARCA_PUBLIC_URL.replace(/\/+$/, "");
  const host = req.headers.host;
  if (!host) return PUBLIC_URL.replace(/\/+$/, "");
  const proto = isLocalHost(host) ? req.protocol : "https";
  return `${proto}://${host}`.replace(/\/+$/, "");
}
/** The canonical MCP resource URI — the OAuth audience access tokens are bound to. */
function resourceOf(req: Request): string {
  return `${baseUrlOf(req)}${MCP_PATH}`;
}

/** A per-user store: wallet-keyed crypto, delegate-signed gas, owner-mapped registry. */
function buildRemoteStore(s: UserSession): MemoryStore {
  return new RemoteMemoryStore(
    new OgStorageClient(s.signerKey),
    keyedCrypto(s.memoryKey),
    new RegistryClient(s.signerKey, OG.registry),
    s.wallet,
  );
}

/** Sentinel "session token" for the dev single-user ARCA_BEARER path (no UserSession). */
const DEV_LOCAL_TOKEN = "__dev_local__";

/**
 * Resolve a request's bearer → the canonical SESSION TOKEN it is bound to (or null).
 * This is the per-request credential we re-check on EVERY /mcp request (not just init),
 * and the value we pin a live transport to — so a leaked Mcp-Session-Id alone is useless,
 * and revoking/expiring a token immediately stops in-flight sessions. Three token shapes:
 *   1. `arca_live_…`  — the deterministic per-user session token (CLI clients, dashboard).
 *   2. an OAuth access token (web clients) — audience-checked against THIS resource,
 *      then mapped to the bound session token (verify its UserSession still exists).
 *   3. ARCA_BEARER     — the dev single-user local-key path → DEV_LOCAL_TOKEN sentinel.
 */
function resolveSessionToken(req: Request): string | null {
  const auth = req.headers.authorization;
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return null;

  // (1) deterministic per-user session bearer — the bearer IS the session token.
  if (sessionForToken(token)) return token;

  // (2) OAuth access token → bound sessionToken (audience-locked to our /mcp resource).
  const boundSessionToken = validateAccessToken(token, resourceOf(req));
  if (boundSessionToken && sessionForToken(boundSessionToken)) return boundSessionToken;

  // (3) dev/local single-user.
  if (BEARER && token === BEARER) return DEV_LOCAL_TOKEN;

  return null;
}

/** Build the store a resolved session token may use (mirrors resolveSessionToken's shapes). */
function storeForSessionToken(st: string): MemoryStore | null {
  if (st === DEV_LOCAL_TOKEN) return buildStore();
  const s = sessionForToken(st);
  return s ? buildRemoteStore(s) : null;
}

const DASHBOARD_DIR =
  process.env.ARCA_DASHBOARD_DIR ||
  path.join(path.dirname(fileURLToPath(import.meta.url)), "../../dashboard");

/** The enclave's bootstrap keypair. In a sealed 0G Sandbox container this privkey
 *  never leaves the TEE; the dashboard ECIES-encrypts the user's signature to the
 *  pubkey so the operator/relay never sees it (Option-3 handoff). Regenerated per
 *  process — fine while sessions are in-memory. */
const BOOTSTRAP = generateBootstrapKeypair();

const app = express();
// Behind EXACTLY ONE trusted proxy (tailscale-funnel / cloudflared / 0G Sandbox ingress):
// trust ONLY that 1 hop. `true` trusts the WHOLE X-Forwarded-For chain → a client could
// spoof req.ip (leftmost XFF) to bypass the per-IP rate limiter and, since the global cap
// then binds, lock out everyone. `1` takes the real client IP the single trusted proxy
// appended (un-spoofable) while still honoring X-Forwarded-Proto=https for force-https.
app.set("trust proxy", 1);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true })); // OAuth /token posts x-www-form-urlencoded

// Diagnostic request log for the OAuth/MCP handshake endpoints (low volume) — lets us see
// exactly which step a web-client (claude.ai/ChatGPT) connection reaches + its status code.
app.use((req, res, next) => {
  if (/^\/(authorize|token|register|mcp|session|bootstrap|\.well-known)/.test(req.path)) {
    res.on("finish", () => console.error(`[REQ] ${req.method} ${req.path} ${res.statusCode}`));
  }
  next();
});

/** Open CORS for the unauthenticated OAuth discovery/registration/token endpoints so
 *  cross-origin web clients (claude.ai, chatgpt.com) can call them. These carry no
 *  ambient credentials, so `*` is safe here (we deliberately do NOT blanket /mcp). */
function corsOpen(res: Response): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Mcp-Session-Id");
}

// ─── rate limiting (per-IP sliding window + global cap) ─────────────────────────
// The unauthenticated OAuth endpoints (/register, /session, /authorize, …) run real
// work (ECDSA-recover + 3×HKDF, DCR inserts). A tiny in-memory sliding-window limiter
// caps abuse cheaply. trust proxy is on, so req.ip is the real client IP.
const RL_WINDOW_MS = 60_000;
const RL_PER_IP_MAX = 30; // per IP / window
const RL_GLOBAL_MAX = 600; // across all IPs / window
const rlHits = new Map<string, number[]>(); // ip → recent request timestamps
const rlGlobal: number[] = []; // all recent request timestamps

/** Drop timestamps older than the window from `arr` (in place); returns its new length. */
function prune(arr: number[], now: number): number {
  let i = 0;
  while (i < arr.length && now - arr[i] >= RL_WINDOW_MS) i++;
  if (i > 0) arr.splice(0, i);
  return arr.length;
}

function rateLimit(req: Request, res: Response, next: () => void): void {
  const now = Date.now();
  // Global cap first (cheap DoS ceiling regardless of source distribution).
  if (prune(rlGlobal, now) >= RL_GLOBAL_MAX) {
    res.status(429).json({ error: "rate_limited" });
    return;
  }
  const ip = req.ip || "unknown";
  let arr = rlHits.get(ip);
  if (!arr) {
    arr = [];
    rlHits.set(ip, arr);
  }
  if (prune(arr, now) >= RL_PER_IP_MAX) {
    res.status(429).json({ error: "rate_limited" });
    return;
  }
  arr.push(now);
  rlGlobal.push(now);
  next();
}

// Bound the limiter map: periodically drop IPs with no recent hits (unref'd).
{
  const t = setInterval(() => {
    const now = Date.now();
    if (prune(rlGlobal, now) === 0) rlGlobal.length = 0;
    for (const [ip, arr] of rlHits) if (prune(arr, now) === 0) rlHits.delete(ip);
  }, RL_WINDOW_MS);
  if (typeof t.unref === "function") t.unref();
}

/** A canonical wallet signature is 0x + 65 bytes (r‖s‖v) = 130 hex chars. Reject junk
 *  cheaply BEFORE the expensive ECDSA-recover + 3×HKDF in createSession. */
const SIG_RE = /^0x[0-9a-fA-F]{130}$/;
function malformedSig(sig: unknown): boolean {
  return typeof sig === "string" && !SIG_RE.test(sig);
}

// Dashboard (connect wallet · sign · deposit · setDelegate · connector) at `/`.
app.use(express.static(DASHBOARD_DIR));

// Liveness — unauthenticated.
app.get("/health", (_req, res) => {
  res.json({ ok: true, name: "arca", transport: "streamable-http", registry: OG.registry, chainId: OG.chainId });
});

// Enclave bootstrap pubkey — the dashboard encrypts the signature to this (operator-blind).
app.get("/bootstrap/pubkey", (_req, res) => {
  res.json({ pubkey: BOOTSTRAP.pubkeyHexCompressed, scheme: "arca-sandbox-handoff-v1" });
});

// ─── OAuth 2.1 (authorization server + resource server) ────────────────────────
// The whole point: Claude.ai / ChatGPT web custom-connectors only auth via OAuth
// redirect (no field to paste a bearer). /authorize serves the dashboard SPA, the
// user signs the Arca EIP-712 → the SAME deterministic UserSession, and we mint an
// OAuth code bound to that session's token. The access token resolves back to it.

// RFC 9728 — protected-resource metadata (where the AS lives).
app.get("/.well-known/oauth-protected-resource", (req, res) => {
  corsOpen(res);
  res.json(protectedResourceMetadata(baseUrlOf(req)));
});
// Some clients probe a path-suffixed variant — answer it the same.
app.get("/.well-known/oauth-protected-resource/mcp", (req, res) => {
  corsOpen(res);
  res.json(protectedResourceMetadata(baseUrlOf(req)));
});

// RFC 8414 — authorization-server metadata.
app.get("/.well-known/oauth-authorization-server", (req, res) => {
  corsOpen(res);
  res.json(authServerMetadata(baseUrlOf(req)));
});

app.options(["/register", "/token", "/.well-known/*"], (_req, res) => {
  corsOpen(res);
  res.status(204).end();
});

// Is a redirect_uri an absolute https URI (or a localhost http URI for native/dev)?
function isValidRedirectUri(u: string): boolean {
  try {
    const url = new URL(u);
    if (url.protocol === "https:") return true;
    if (url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1")) return true;
    return false;
  } catch {
    return false;
  }
}

// Dynamic Client Registration (RFC 7591). Bounded inputs (anti memory-DoS).
const MAX_REDIRECT_URIS = 5;
const MAX_URI_LEN = 512;
const MAX_META_LEN = 256;
app.post("/register", rateLimit, (req, res) => {
  corsOpen(res);
  const body = (req.body ?? {}) as { redirect_uris?: unknown; client_name?: unknown; scope?: unknown };
  const uris = body.redirect_uris;
  if (
    !Array.isArray(uris) ||
    uris.length === 0 ||
    uris.length > MAX_REDIRECT_URIS ||
    !uris.every((u) => typeof u === "string" && u.length <= MAX_URI_LEN && isValidRedirectUri(u))
  ) {
    res.status(400).json({
      error: "invalid_redirect_uri",
      error_description: `redirect_uris must be 1–${MAX_REDIRECT_URIS} absolute https (or localhost http) URIs, each ≤${MAX_URI_LEN} chars`,
    });
    return;
  }
  // Bound the free-text metadata fields so a client can't bloat the table entry.
  if (
    (typeof body.client_name === "string" && body.client_name.length > MAX_META_LEN) ||
    (typeof body.scope === "string" && body.scope.length > MAX_META_LEN)
  ) {
    res.status(400).json({
      error: "invalid_client_metadata",
      error_description: `client_name and scope must each be ≤${MAX_META_LEN} chars`,
    });
    return;
  }
  const client = registerClient(req.body ?? {});
  res.status(201).json(client);
});

// /authorize — validate the request, then serve the dashboard SPA (it reads the OAuth
// params from window.location.search and runs the wallet connect+sign flow).
app.get("/authorize", rateLimit, (req, res) => {
  const q = req.query as Record<string, string | undefined>;
  const client = q.client_id ? getClient(q.client_id) : undefined;
  const redirectUri = q.redirect_uri ?? "";

  // Invalid client OR unregistered redirect_uri → ONE generic 400 HTML (NEVER redirect —
  // prevents open redirect). The two cases are collapsed so an attacker can't use the
  // response to distinguish a registered client_id from an unknown one (enumeration oracle).
  if (!client || !redirectUri || !client.redirect_uris.includes(redirectUri)) {
    res.status(400).type("html").send("<h1>invalid request</h1><p>The authorization request is invalid.</p>");
    return;
  }

  // Other param errors are reported via redirect (the client owns redirect_uri now).
  const fail = (error: string) => {
    const u = new URL(redirectUri);
    u.searchParams.set("error", error);
    if (q.state) u.searchParams.set("state", q.state);
    res.redirect(u.toString());
  };
  if (q.response_type !== "code") return fail("unsupported_response_type");
  if (!q.code_challenge) return fail("invalid_request");
  if (q.code_challenge_method !== "S256") return fail("invalid_request"); // PKCE S256 mandatory

  // Bind the consent to THIS browser: a nonce in an HttpOnly cookie that /authorize/approve
  // must echo back + match the same client_id+code_challenge (anti session-fixation).
  const nonce = mintAuthzNonce(client.client_id, q.code_challenge);
  res.setHeader("Set-Cookie", `arca_authz=${nonce}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`);

  // Valid → hand the SPA the request (it reads the params from the URL). Static export's
  // index.html is in DASHBOARD_DIR (the Next `out/` dir in production).
  res.sendFile(path.join(DASHBOARD_DIR, "index.html"), (err) => {
    if (err) res.status(500).type("html").send("<h1>dashboard unavailable</h1>");
  });
});

// /authorize/approve — the dashboard calls this AFTER the user signs. It carries the
// wallet signature (or operator-blind envelope) + the OAuth params from the URL. We
// re-validate everything, createSession(...) (the deterministic UserSession), then mint
// an auth code bound to {client_id, redirect_uri, code_challenge, session.token, ...}.
app.post("/authorize/approve", rateLimit, async (req, res) => {
  try {
    const b = (req.body ?? {}) as {
      wallet?: string;
      signature?: string;
      envelope?: HandoffEnvelope;
      client_id?: string;
      redirect_uri?: string;
      code_challenge?: string;
      code_challenge_method?: string;
      state?: string;
      resource?: string;
      scope?: string;
    };

    // Re-validate the OAuth params server-side (don't trust the SPA).
    const client = b.client_id ? getClient(b.client_id) : undefined;
    if (!client) {
      res.status(400).json({ error: "invalid_client" });
      return;
    }
    if (!b.redirect_uri || !client.redirect_uris.includes(b.redirect_uri)) {
      res.status(400).json({ error: "invalid_redirect_uri" });
      return;
    }
    // Audience pinning (RFC 8707): a token may ONLY be bound to THIS server's canonical
    // resource. Reject a client-supplied `resource` that isn't ours — Arca must never be
    // a token-minting oracle for an arbitrary audience.
    const canonical = resourceOf(req);
    if (b.resource && b.resource !== canonical) {
      res.status(400).json({ error: "invalid_target", error_description: "resource must be this MCP server" });
      return;
    }
    if (!b.code_challenge || b.code_challenge_method !== "S256") {
      res.status(400).json({ error: "invalid_request", error_description: "PKCE S256 required" });
      return;
    }
    // Anti session-fixation: this POST must come from the same browser that opened GET
    // /authorize — it carries the HttpOnly `arca_authz` cookie bound to client + challenge.
    const cookieNonce = /(?:^|;\s*)arca_authz=([^;]+)/.exec(req.headers.cookie ?? "")?.[1];
    if (!checkAuthzNonce(cookieNonce, client.client_id, b.code_challenge)) {
      res.status(400).json({
        error: "invalid_request",
        error_description: "authorization session missing/mismatched — open /authorize in this browser first",
      });
      return;
    }
    if (!b.wallet) {
      res.status(400).json({ error: "invalid_request", error_description: "wallet is required" });
      return;
    }
    // Cheap pre-check: reject a malformed raw signature BEFORE the costly ECDSA-recover +
    // 3×HKDF in createSession (an envelope is decrypted first, so only gate a present sig).
    if (malformedSig(b.signature)) {
      res.status(400).json({ error: "invalid_request" });
      return;
    }

    // Recover the signature (decrypt the envelope in-process / in-enclave if present).
    let sig = b.signature;
    if (!sig && b.envelope) {
      try {
        sig = new TextDecoder().decode(decryptWithPrivkey(BOOTSTRAP.privkeyHex, b.envelope));
      } catch {
        res.status(400).json({ error: "invalid_request", error_description: "envelope decrypt failed" });
        return;
      }
    }
    if (!sig) {
      res.status(400).json({ error: "invalid_request", error_description: "signature or envelope is required" });
      return;
    }

    // The SAME deterministic session the bearer flow produces.
    const session = await createSession(b.wallet, sig);

    const code = mintAuthCode({
      client_id: client.client_id,
      redirect_uri: b.redirect_uri,
      code_challenge: b.code_challenge,
      code_challenge_method: b.code_challenge_method,
      sessionToken: session.token,
      resource: canonical,
      scope: b.scope,
    });

    const redirect = new URL(b.redirect_uri);
    redirect.searchParams.set("code", code);
    if (b.state) redirect.searchParams.set("state", b.state);

    res.json({
      redirect: redirect.toString(),
      // So the page can still surface deposit/authorize status if needed.
      signerAddress: session.signerAddress,
      registry: OG.registry,
      chainId: OG.chainId,
    });
  } catch (err) {
    // Do NOT echo err.message (info leak — e.g. "signature does not match wallet" is an
    // oracle). Log internally, return a fixed generic body.
    console.error("[/authorize/approve] error:", err);
    res.status(400).json({ error: "invalid_request" });
  }
});

// /token — authorization_code (PKCE) + refresh_token (rotation).
app.post("/token", rateLimit, (req, res) => {
  corsOpen(res);
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  const b = (req.body ?? {}) as Record<string, string | undefined>;
  const grant = b.grant_type;

  if (grant === "authorization_code") {
    const { code, code_verifier, redirect_uri, client_id, resource } = b;
    if (!code || !client_id) {
      res.status(400).json({ error: "invalid_request" });
      return;
    }
    const canonical = resourceOf(req);
    if (resource && resource !== canonical) {
      res.status(400).json({ error: "invalid_target" });
      return;
    }
    const rec = consumeAuthCode(code); // single-use; null if used/expired/unknown
    if (!rec) {
      res.status(400).json({ error: "invalid_grant" });
      return;
    }
    if (rec.client_id !== client_id || rec.redirect_uri !== redirect_uri) {
      res.status(400).json({ error: "invalid_grant" });
      return;
    }
    if (!verifyPkce(code_verifier, rec.code_challenge, rec.code_challenge_method)) {
      res.status(400).json({ error: "invalid_grant", error_description: "PKCE verification failed" });
      return;
    }
    // Audience is ALWAYS this server's canonical resource — never echoed from client input.
    const tokens = issueTokens({
      sessionToken: rec.sessionToken,
      client_id,
      resource: canonical,
      scope: rec.scope,
    });
    res.json(tokens);
    return;
  }

  if (grant === "refresh_token") {
    const { refresh_token, client_id } = b;
    if (!refresh_token || !client_id) {
      res.status(400).json({ error: "invalid_request" });
      return;
    }
    const tokens = rotateRefresh(refresh_token, client_id);
    if (!tokens) {
      res.status(400).json({ error: "invalid_grant" });
      return;
    }
    res.json(tokens);
    return;
  }

  res.status(400).json({ error: "unsupported_grant_type" });
});

// Login — the dashboard posts {wallet, signature} OR {wallet, envelope}. The envelope
// is the signature ECIES-encrypted to /bootstrap/pubkey; it is decrypted in-process
// (in-enclave when running sealed), so a relay/operator never sees the signature.
app.post("/session", rateLimit, async (req, res) => {
  try {
    const { wallet, signature, envelope } = (req.body ?? {}) as {
      wallet?: string;
      signature?: string;
      envelope?: HandoffEnvelope;
    };
    if (!wallet) {
      res.status(400).json({ error: "wallet is required" });
      return;
    }
    // Cheap pre-check: reject a malformed raw signature BEFORE the costly ECDSA-recover +
    // 3×HKDF in createSession (an envelope is decrypted first, so only gate a present sig).
    if (malformedSig(signature)) {
      res.status(400).json({ error: "invalid_request" });
      return;
    }
    let sig = signature;
    if (!sig && envelope) {
      try {
        sig = new TextDecoder().decode(decryptWithPrivkey(BOOTSTRAP.privkeyHex, envelope));
      } catch {
        res.status(400).json({ error: "envelope decrypt failed" });
        return;
      }
    }
    if (!sig) {
      res.status(400).json({ error: "signature or envelope is required" });
      return;
    }
    const s = await createSession(wallet, sig);
    // Prefer the request's own host (the 0G Sandbox nip.io endpoint when deployed)
    // so the connector URL is correct wherever the container runs; ARCA_PUBLIC_URL overrides.
    // baseUrlOf forces https for non-localhost (no http:// connector URL leaks to clients).
    res.json({
      token: s.token,
      connectorUrl: resourceOf(req),
      signerAddress: s.signerAddress, // fund this (deposit) + setDelegate it on the registry
      registry: OG.registry,
      chainId: OG.chainId,
      next: "Fund signerAddress with 0G and call setDelegate(signerAddress,true) on the registry, then add the connector to any agent with the token.",
    });
  } catch (err) {
    // Generic body (no err.message leak — could be an ownership oracle); log internally.
    console.error("[/session] error:", err);
    res.status(400).json({ error: "invalid_request" });
  }
});

// Validate a bearer token — the dashboard calls this on load to restore a cached
// session without re-signing (the session is re-derivable from the wallet sig anyway).
app.get("/session", (req, res) => {
  const auth = req.headers.authorization;
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : "";
  const s = token ? sessionForToken(token) : undefined;
  if (!s) {
    res.status(401).json({ error: "invalid or expired token" });
    return;
  }
  res.json({
    token: s.token,
    wallet: s.wallet,
    connectorUrl: resourceOf(req),
    signerAddress: s.signerAddress,
    registry: OG.registry,
    chainId: OG.chainId,
  });
});

// One transport per MCP session, keyed by the Mcp-Session-Id header. Each entry pins the
// SESSION TOKEN the session was authenticated as + its last-activity time. We re-validate
// the bearer on EVERY request and assert it still resolves to this exact session token —
// so revocation/expiry takes effect mid-session and a leaked Mcp-Session-Id is not enough.
interface TransportEntry {
  transport: StreamableHTTPServerTransport;
  sessionToken: string;
  lastActivity: number;
}
const transports: Record<string, TransportEntry> = {};

const IDLE_TIMEOUT_MS = 10 * 60_000; // 10 min — close + drop idle transports
const MAX_SESSIONS_PER_TOKEN = 10; // cap concurrent MCP sessions per user (anti-DoS)

/** Send the RFC 9728 §5.1 401 pointing unauthenticated clients at the PR metadata (so web
 *  clients can discover the AS) + a scope hint. Used for both init and per-request auth. */
function send401(req: Request, res: Response): void {
  res.setHeader(
    "WWW-Authenticate",
    `Bearer resource_metadata="${baseUrlOf(req)}/.well-known/oauth-protected-resource", scope="arca.memory"`,
  );
  res.status(401).json({ error: "unauthorized — present a valid Bearer token (POST /session first)" });
}

/** Per-request re-check for an already-bound transport: the bearer MUST be present on EVERY
 *  request AND re-resolve to the SAME bound session token. This is what the MCP spec mandates
 *  ("authorization MUST be included in every HTTP request") and what every official client SDK
 *  does (the bearer rides every POST/GET/DELETE). So a leaked/absent Mcp-Session-Id is NOT a
 *  standalone credential, and token revocation/expiry take effect mid-session. (A deep research
 *  pass confirmed no real remote client is init-only — the earlier OpenCode "evidence" was a
 *  LOCAL stdio arca that never hit this path, so the prior absent-bearer relaxation was dead
 *  weight + a downgrade; reverted.) resolveSessionToken returns null for a missing/invalid
 *  bearer, so an absent bearer fails this equality and 401s. */
function reauthorized(req: Request, entry: TransportEntry): boolean {
  return resolveSessionToken(req) === entry.sessionToken;
}

// Idle sweep: close + delete any transport untouched for IDLE_TIMEOUT_MS (unref'd).
{
  const t = setInterval(() => {
    const now = Date.now();
    for (const [sid, e] of Object.entries(transports)) {
      if (now - e.lastActivity > IDLE_TIMEOUT_MS) {
        delete transports[sid];
        try {
          e.transport.close();
        } catch {
          /* already closed */
        }
      }
    }
  }, 60_000);
  if (typeof t.unref === "function") t.unref();
}

app.post(MCP_PATH, async (req: Request, res: Response) => {
  const sid = req.headers["mcp-session-id"] as string | undefined;
  const entry = sid ? transports[sid] : undefined;

  if (!entry) {
    if (!isInitializeRequest(req.body)) {
      res.status(400).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "No valid session — send an initialize request first." },
        id: null,
      });
      return;
    }
    // Authenticate at initialize → the bound session token, then build its store.
    const sessionToken = resolveSessionToken(req);
    if (!sessionToken) {
      send401(req, res);
      return;
    }
    // Per-user session cap (anti-DoS): a single user can't open unbounded transports.
    let live = 0;
    for (const e of Object.values(transports)) if (e.sessionToken === sessionToken) live++;
    if (live >= MAX_SESSIONS_PER_TOKEN) {
      res.status(429).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Too many concurrent sessions — close an existing one first." },
        id: null,
      });
      return;
    }
    const store = storeForSessionToken(sessionToken);
    if (!store) {
      send401(req, res);
      return;
    }
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => {
        transports[id] = { transport, sessionToken, lastActivity: Date.now() };
      },
    });
    transport.onclose = () => {
      if (transport.sessionId) delete transports[transport.sessionId];
    };
    await buildArcaServer(store).connect(transport);
    await transport.handleRequest(req, res, req.body);
    return;
  }

  // Per-request re-validation (bearer-present → must match for revocation/expiry; bearer-absent
  // → the bearer-minted session id authorizes the connection; wrong bearer → rejected).
  if (!reauthorized(req, entry)) {
    send401(req, res);
    return;
  }
  entry.lastActivity = Date.now();
  await entry.transport.handleRequest(req, res, req.body);
});

// GET (SSE stream) + DELETE (close) reuse the session's already-bound transport — same
// per-request re-check applies (a present bearer must match; an absent one rides the
// bearer-minted session id; a wrong bearer is rejected).
const bySession = async (req: Request, res: Response) => {
  const sid = req.headers["mcp-session-id"] as string | undefined;
  const entry = sid ? transports[sid] : undefined;
  if (!entry) {
    res.status(400).send("Invalid or missing session id");
    return;
  }
  if (!reauthorized(req, entry)) {
    send401(req, res);
    return;
  }
  entry.lastActivity = Date.now();
  await entry.transport.handleRequest(req, res);
};
app.get(MCP_PATH, bySession);
app.delete(MCP_PATH, bySession);

if (!process.env.ARCA_PUBLIC_URL) {
  console.error(
    "WARNING: ARCA_PUBLIC_URL is unset — the OAuth audience + discovery URLs fall back to the request Host header (dev only). A spoofed Host could mis-bind token audience; set ARCA_PUBLIC_URL in production (the deploy compose does).",
  );
}
loadClients(); // restore persisted DCR client registrations — web connectors survive restarts
startOauthSweep(); // periodically prune expired OAuth codes/tokens/nonces (bounds memory)
app.listen(PORT, process.env.ARCA_HOST ?? "0.0.0.0", () => {
  console.error(`arca MCP (streamable-http, per-user) on ${PUBLIC_URL}${MCP_PATH} · bound ${process.env.ARCA_HOST ?? "0.0.0.0"}:${PORT}`);
  console.error(`registry ${OG.registry} · chain ${OG.chainId} · POST /session to get a token`);
});
