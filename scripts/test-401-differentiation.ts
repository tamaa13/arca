/**
 * E2E: the 401 must NOT advertise OAuth when a VALID connector token is presented but its wallet has
 * no live session — otherwise a static-bearer CLI (Cursor/raw) gets pushed into the web OAuth flow
 * just because its session lapsed. We pre-seed a connector row (no session) and check the headers.
 * Run: bun scripts/test-401-differentiation.ts
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";

const PORT = "8794";
const BASE = `http://localhost:${PORT}`;
const FILE = "/tmp/arca-401diff-conn.json";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log((c ? "✓ " : "✗ FAIL ") + m); c ? pass++ : fail++; };
const mcpHdr = { "content-type": "application/json", accept: "application/json, text/event-stream" };
const init = { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "x", version: "1" } } };

// A valid (non-revoked, non-expired) connector row whose wallet will have NO in-RAM session.
const RAW = "arca_live_deadsessiontoken_abc123456789";
const hash = createHash("sha256").update(RAW).digest("hex");
const wallet = "0x000000000000000000000000000000000000dead";
const row = { hash, wallet, label: "dead-session-cli", kind: "cli", createdAt: Math.floor(Date.now() / 1000), expiresAt: 0, revoked: false };
writeFileSync(FILE, JSON.stringify([row]));

const server = spawn("bun", ["src/transport/http-server.ts"], {
  env: { ...process.env, ARCA_PORT: PORT, ARCA_PUBLIC_URL: BASE, ARCA_CONNECTORS_FILE: FILE, ARCA_REGISTRY_ADDR: "0xc196C28886c93462f55A78134b5bF6118A3f5860" },
  stdio: "inherit",
});
const done = (code: number) => { try { server.kill("SIGKILL"); } catch {} process.exit(code); };

async function initResp(token?: string) {
  const headers: Record<string, string> = { ...mcpHdr };
  if (token) headers.authorization = `Bearer ${token}`;
  const r = await fetch(`${BASE}/mcp`, { method: "POST", headers, body: JSON.stringify(init) });
  return { status: r.status, www: r.headers.get("www-authenticate") };
}

try {
  for (let i = 0; ; i++) { try { if ((await fetch(`${BASE}/health`)).ok) break; } catch {} if (i > 40) throw new Error("server not healthy"); await sleep(250); }
  console.log("✓ server healthy (connector row pre-seeded, no session)");

  // (1) valid connector token, but NO live session → 401 WITHOUT the OAuth challenge (re-sign hint).
  const dead = await initResp(RAW);
  ok(dead.status === 401, "valid-token-no-session → 401");
  ok(dead.www === null, "valid-token-no-session → NO WWW-Authenticate (CLI not pushed into OAuth)");

  // (2) no auth at all → 401 WITH the OAuth challenge (so a web client can discover + sign in).
  const anon = await initResp();
  ok(anon.status === 401, "no auth → 401");
  ok(!!anon.www && anon.www.includes("resource_metadata"), "no auth → WWW-Authenticate present (web discovery)");

  // (3) unknown/garbage bearer → 401 WITH the OAuth challenge (could be a web client mid-handshake).
  const junk = await initResp("arca_live_not_a_real_token_zzz");
  ok(junk.status === 401, "garbage token → 401");
  ok(!!junk.www && junk.www.includes("resource_metadata"), "garbage token → WWW-Authenticate present");

  console.log(`\n${fail === 0 ? "✅ ALL PASS" : "❌ FAIL"} — ${pass} passed, ${fail} failed`);
  done(fail === 0 ? 0 : 1);
} catch (e) {
  console.error("✗ error:", e);
  done(1);
}
