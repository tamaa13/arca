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
import { OG, type MemoryStore } from "../types.js";

const PORT = Number(process.env.ARCA_PORT ?? 8787);
const BEARER = process.env.ARCA_BEARER ?? ""; // optional dev single-user (local key)
const PUBLIC_URL = process.env.ARCA_PUBLIC_URL ?? `http://localhost:${PORT}`;
const MCP_PATH = "/mcp";

/** A per-user store: wallet-keyed crypto, delegate-signed gas, owner-mapped registry. */
function buildRemoteStore(s: UserSession): MemoryStore {
  return new RemoteMemoryStore(
    new OgStorageClient(s.signerKey),
    keyedCrypto(s.memoryKey),
    new RegistryClient(s.signerKey, OG.registry),
    s.wallet,
  );
}

/** Resolve a request's bearer → the store it may use (per-user session, or dev local). */
function resolveStore(req: Request): MemoryStore | null {
  const auth = req.headers.authorization;
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : "";
  if (token) {
    const session = sessionForToken(token);
    if (session) return buildRemoteStore(session);
    if (BEARER && token === BEARER) return buildStore(); // dev/local single-user
  }
  return null;
}

const DASHBOARD_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../dashboard");

const app = express();
app.use(express.json({ limit: "1mb" }));

// Dashboard (connect wallet · sign · deposit · setDelegate · connector) at `/`.
app.use(express.static(DASHBOARD_DIR));

// Liveness — unauthenticated.
app.get("/health", (_req, res) => {
  res.json({ ok: true, name: "arca", transport: "streamable-http", registry: OG.registry, chainId: OG.chainId });
});

// Login — the dashboard posts {wallet, signature}; we issue a connector token.
app.post("/session", async (req, res) => {
  try {
    const { wallet, signature } = (req.body ?? {}) as { wallet?: string; signature?: string };
    if (!wallet || !signature) {
      res.status(400).json({ error: "wallet and signature are required" });
      return;
    }
    const s = await createSession(wallet, signature);
    res.json({
      token: s.token,
      connectorUrl: `${PUBLIC_URL}${MCP_PATH}`,
      signerAddress: s.signerAddress, // fund this (deposit) + setDelegate it on the registry
      registry: OG.registry,
      chainId: OG.chainId,
      next: "Fund signerAddress with 0G and call setDelegate(signerAddress,true) on the registry, then add the connector to any agent with the token.",
    });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
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

app.listen(PORT, () => {
  console.error(`arca MCP (streamable-http, per-user) on ${PUBLIC_URL}${MCP_PATH}`);
  console.error(`registry ${OG.registry} · chain ${OG.chainId} · POST /session to get a token`);
});
