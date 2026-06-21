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
} from "../auth/oauth.js";
import { generateBootstrapKeypair, decryptWithPrivkey, type HandoffEnvelope } from "../sandbox/handoff.js";
import { OG, type MemoryStore } from "../types.js";

const PORT = Number(process.env.ARCA_PORT ?? 8787);
const BEARER = process.env.ARCA_BEARER ?? ""; // optional dev single-user (local key)
const PUBLIC_URL = process.env.ARCA_PUBLIC_URL ?? `http://localhost:${PORT}`;
const MCP_PATH = "/mcp";

/** The public base URL (no trailing slash). ARCA_PUBLIC_URL wins; else derive from the
 *  request (the 0G Sandbox nip.io host when deployed). Mirrors the /session `base` logic. */
function baseUrlOf(req: Request): string {
  const b = process.env.ARCA_PUBLIC_URL || `${req.protocol}://${req.headers.host}` || PUBLIC_URL;
  return b.replace(/\/+$/, "");
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

/**
 * Resolve a request's bearer → the store it may use. Three accepted token shapes:
 *   1. `arca_live_…`  — the deterministic per-user session token (CLI clients, dashboard).
 *   2. an OAuth access token (web clients) — audience-checked against THIS resource,
 *      then resolved to the bound UserSession (no token passthrough: we use Arca's own signer).
 *   3. ARCA_BEARER     — the dev single-user local-key path.
 */
function resolveStore(req: Request): MemoryStore | null {
  const auth = req.headers.authorization;
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return null;

  // (1) deterministic per-user session bearer
  const session = sessionForToken(token);
  if (session) return buildRemoteStore(session);

  // (2) OAuth access token → bound sessionToken (audience-locked to our /mcp resource)
  const boundSessionToken = validateAccessToken(token, resourceOf(req));
  if (boundSessionToken) {
    const s = sessionForToken(boundSessionToken);
    if (s) return buildRemoteStore(s);
  }

  // (3) dev/local single-user
  if (BEARER && token === BEARER) return buildStore();
  return null;
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
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true })); // OAuth /token posts x-www-form-urlencoded

/** Open CORS for the unauthenticated OAuth discovery/registration/token endpoints so
 *  cross-origin web clients (claude.ai, chatgpt.com) can call them. These carry no
 *  ambient credentials, so `*` is safe here (we deliberately do NOT blanket /mcp). */
function corsOpen(res: Response): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Mcp-Session-Id");
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

// Dynamic Client Registration (RFC 7591).
app.post("/register", (req, res) => {
  corsOpen(res);
  const body = (req.body ?? {}) as { redirect_uris?: unknown };
  const uris = body.redirect_uris;
  if (!Array.isArray(uris) || uris.length === 0 || !uris.every((u) => typeof u === "string" && isValidRedirectUri(u))) {
    res.status(400).json({
      error: "invalid_redirect_uri",
      error_description: "redirect_uris must be a non-empty array of absolute https (or localhost http) URIs",
    });
    return;
  }
  const client = registerClient(req.body ?? {});
  res.status(201).json(client);
});

// /authorize — validate the request, then serve the dashboard SPA (it reads the OAuth
// params from window.location.search and runs the wallet connect+sign flow).
app.get("/authorize", (req, res) => {
  const q = req.query as Record<string, string | undefined>;
  const client = q.client_id ? getClient(q.client_id) : undefined;

  // Invalid client / redirect_uri → 400 HTML (NEVER redirect — prevents open redirect).
  if (!client) {
    res.status(400).type("html").send("<h1>invalid_client</h1><p>Unknown or missing client_id.</p>");
    return;
  }
  const redirectUri = q.redirect_uri ?? "";
  if (!redirectUri || !client.redirect_uris.includes(redirectUri)) {
    // EXACT match against registered URIs — no prefix/substring.
    res.status(400).type("html").send("<h1>invalid_redirect_uri</h1><p>redirect_uri is not registered for this client.</p>");
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
app.post("/authorize/approve", async (req, res) => {
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
    res.status(400).json({ error: "invalid_request", error_description: err instanceof Error ? err.message : String(err) });
  }
});

// /token — authorization_code (PKCE) + refresh_token (rotation).
app.post("/token", (req, res) => {
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
app.post("/session", async (req, res) => {
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
    const base = process.env.ARCA_PUBLIC_URL || `${req.protocol}://${req.headers.host}` || PUBLIC_URL;
    res.json({
      token: s.token,
      connectorUrl: `${base}${MCP_PATH}`,
      signerAddress: s.signerAddress, // fund this (deposit) + setDelegate it on the registry
      registry: OG.registry,
      chainId: OG.chainId,
      next: "Fund signerAddress with 0G and call setDelegate(signerAddress,true) on the registry, then add the connector to any agent with the token.",
    });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
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
  const base = process.env.ARCA_PUBLIC_URL || `${req.protocol}://${req.headers.host}` || PUBLIC_URL;
  res.json({
    token: s.token,
    wallet: s.wallet,
    connectorUrl: `${base}${MCP_PATH}`,
    signerAddress: s.signerAddress,
    registry: OG.registry,
    chainId: OG.chainId,
  });
});

// One transport per MCP session, keyed by the Mcp-Session-Id header.
const transports: Record<string, StreamableHTTPServerTransport> = {};

app.post(MCP_PATH, async (req: Request, res: Response) => {
  const sid = req.headers["mcp-session-id"] as string | undefined;
  let transport = sid ? transports[sid] : undefined;

  if (!transport) {
    if (!isInitializeRequest(req.body)) {
      res.status(400).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "No valid session — send an initialize request first." },
        id: null,
      });
      return;
    }
    // Bind the per-user store at initialize (the bearer is present on this request).
    const store = resolveStore(req);
    if (!store) {
      // RFC 9728 §5.1 — point unauthenticated clients at the protected-resource metadata
      // so web clients (claude.ai, chatgpt.com) can discover the OAuth AS and start the flow.
      res.setHeader(
        "WWW-Authenticate",
        `Bearer resource_metadata="${baseUrlOf(req)}/.well-known/oauth-protected-resource"`,
      );
      res.status(401).json({ error: "unauthorized — present a valid Bearer token (POST /session first)" });
      return;
    }
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => {
        transports[id] = transport!;
      },
    });
    transport.onclose = () => {
      if (transport!.sessionId) delete transports[transport!.sessionId];
    };
    await buildArcaServer(store).connect(transport);
  }

  await transport.handleRequest(req, res, req.body);
});

// GET (SSE stream) + DELETE (close) reuse the session's already-bound transport.
const bySession = async (req: Request, res: Response) => {
  const sid = req.headers["mcp-session-id"] as string | undefined;
  const transport = sid ? transports[sid] : undefined;
  if (!transport) {
    res.status(400).send("Invalid or missing session id");
    return;
  }
  await transport.handleRequest(req, res);
};
app.get(MCP_PATH, bySession);
app.delete(MCP_PATH, bySession);

if (!process.env.ARCA_PUBLIC_URL) {
  console.error(
    "WARNING: ARCA_PUBLIC_URL is unset — the OAuth audience + discovery URLs fall back to the request Host header (dev only). A spoofed Host could mis-bind token audience; set ARCA_PUBLIC_URL in production (the deploy compose does).",
  );
}
startOauthSweep(); // periodically prune expired OAuth codes/tokens/nonces (bounds memory)
app.listen(PORT, process.env.ARCA_HOST ?? "0.0.0.0", () => {
  console.error(`arca MCP (streamable-http, per-user) on ${PUBLIC_URL}${MCP_PATH} · bound ${process.env.ARCA_HOST ?? "0.0.0.0"}:${PORT}`);
  console.error(`registry ${OG.registry} · chain ${OG.chainId} · POST /session to get a token`);
});
