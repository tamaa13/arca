/**
 * Arca MCP — remote transport (Streamable HTTP). Phase 1a.
 *
 * One hosted URL that every agent platform connects to (Claude Code/web, ChatGPT,
 * Cursor, Copilot, OpenCode, Antigravity; Codex via the mcp-remote bridge). SSE is
 * deprecated, so we serve Streamable HTTP only.
 *
 * Auth (1a): a single static bearer token (ARCA_BEARER). OAuth 2.1 + per-user
 * wallet sessions land in 1b — for now there is ONE shared store (local key), so
 * this is the transport-proof milestone, NOT the privacy milestone.
 *
 * Run: ARCA_BEARER=dev-token npx tsx src/transport/http-server.ts
 */
import { randomUUID } from "node:crypto";
import express, { type Request, type Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { buildArcaServer, buildStore } from "../mcp/build-server.js";

const PORT = Number(process.env.ARCA_PORT ?? 8787);
const BEARER = process.env.ARCA_BEARER ?? ""; // empty = no auth (local dev only)
const MCP_PATH = "/mcp";

const app = express();
app.use(express.json({ limit: "1mb" }));

// Liveness — unauthenticated.
app.get("/health", (_req, res) => {
  res.json({ ok: true, name: "arca", transport: "streamable-http" });
});

// Static-bearer auth on the MCP path (1a). No bearer set → open (local dev).
app.use(MCP_PATH, (req, res, next) => {
  if (!BEARER) return next();
  if (req.headers.authorization === `Bearer ${BEARER}`) return next();
  res.status(401).json({ error: "unauthorized" });
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
    // New session: spin up a transport + a fresh Arca server bound to it.
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => {
        transports[id] = transport!;
      },
    });
    transport.onclose = () => {
      if (transport!.sessionId) delete transports[transport!.sessionId];
    };
    await buildArcaServer(buildStore()).connect(transport);
  }

  await transport.handleRequest(req, res, req.body);
});

// GET (SSE stream) + DELETE (session close) reuse the session's transport.
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
  console.error(`arca MCP (streamable-http) on http://localhost:${PORT}${MCP_PATH}`);
  console.error(BEARER ? "auth: static bearer" : "auth: OPEN (no ARCA_BEARER set — local dev only)");
});
