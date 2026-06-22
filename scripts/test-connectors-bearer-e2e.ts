/**
 * E2E: connector management via the SESSION BEARER (Tier-2 path — the signed-in dashboard
 * mints/revokes with one click, NO extra wallet signature). Proves over real HTTP:
 *   - mint with Authorization: Bearer <sessionToken> (no signature) works,
 *   - the minted token authenticates /mcp,
 *   - revoke with the same bearer (no signature) → token 401s next request,
 *   - cross-wallet isolation: wallet B's bearer cannot revoke wallet A's connector,
 *   - no bearer + no signature → 401 (unauthorized).
 * Run: bun scripts/test-connectors-bearer-e2e.ts
 */
import { spawn } from "node:child_process";
import { Wallet } from "ethers";
import { ARCA_KEY_DOMAIN, ARCA_KEY_TYPES, arcaKeyMessage } from "../src/wallet/sig-key.js";

const PORT = "8793";
const BASE = `http://localhost:${PORT}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log((c ? "✓ " : "✗ FAIL ") + m); c ? pass++ : fail++; };
const mcpHdr = { "content-type": "application/json", accept: "application/json, text/event-stream" };
const init = { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "bearer-e2e", version: "1" } } };
const follow = { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} };

const server = spawn("bun", ["src/transport/http-server.ts"], {
  env: { ...process.env, ARCA_PORT: PORT, ARCA_CONNECTORS_FILE: "/tmp/arca-conn-bearer-e2e.json", ARCA_REGISTRY_ADDR: "0xc196C28886c93462f55A78134b5bF6118A3f5860" },
  stdio: "inherit",
});
const done = (code: number) => { try { server.kill("SIGKILL"); } catch {} process.exit(code); };
const jpost = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${BASE}${path}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

async function session(w: Wallet): Promise<string> {
  const sig = await w.signTypedData(ARCA_KEY_DOMAIN, ARCA_KEY_TYPES, arcaKeyMessage());
  const j = (await (await jpost("/session", { wallet: w.address, signature: sig })).json()) as { token?: string };
  if (!j.token) throw new Error("no session token");
  return j.token;
}
const bearer = (t: string) => ({ authorization: `Bearer ${t}` });
async function mcpInit(token: string) {
  const r = await fetch(`${BASE}/mcp`, { method: "POST", headers: { ...mcpHdr, ...bearer(token) }, body: JSON.stringify(init) });
  return { status: r.status, sid: r.headers.get("mcp-session-id") };
}
const mcpFollow = async (token: string, sid: string) =>
  (await fetch(`${BASE}/mcp`, { method: "POST", headers: { ...mcpHdr, ...bearer(token), "mcp-session-id": sid }, body: JSON.stringify(follow) })).status;

try {
  for (let i = 0; ; i++) { try { if ((await fetch(`${BASE}/health`)).ok) break; } catch {} if (i > 40) throw new Error("server not healthy"); await sleep(250); }
  console.log("✓ server healthy");

  const A = Wallet.createRandom();
  const sA = await session(A);
  ok(!!sA, "wallet A session created");

  // mint via session bearer — NO signature in the body
  const mintRes = await jpost("/connectors/mint", { label: "Codex-laptop" }, bearer(sA));
  const mint = (await mintRes.json()) as { token?: string; id?: string };
  ok(mintRes.ok && !!mint.token && mint.token.startsWith("arca_live_"), "mint via bearer (no signature) → token");

  const iC = await mcpInit(mint.token!);
  ok(iC.status === 200 && !!iC.sid, "minted token authenticates /mcp");

  const list = (await (await fetch(`${BASE}/connectors`, { headers: bearer(sA) })).json()) as { connectors?: { id: string }[] };
  ok(list.connectors?.length === 1, "GET /connectors lists it (bearer)");

  // revoke via session bearer — NO signature
  const revRes = await jpost("/connectors/revoke", { connectorId: mint.id }, bearer(sA));
  ok(revRes.ok, "revoke via bearer (no signature) → ok");
  ok((await mcpFollow(mint.token!, iC.sid!)) === 401, "revoked token → 401 on next /mcp");
  ok((await mcpInit(mint.token!)).status === 401, "revoked token → 401 on a fresh init too");

  // cross-wallet isolation: B's bearer cannot revoke A's connector
  const B = Wallet.createRandom();
  const sB = await session(B);
  const mint2 = (await (await jpost("/connectors/mint", { label: "A-second" }, bearer(sA))).json()) as { id?: string; token?: string };
  const cross = await jpost("/connectors/revoke", { connectorId: mint2.id }, bearer(sB));
  ok(cross.status === 404, "wallet B's bearer canNOT revoke wallet A's connector (404)");
  ok((await mcpInit(mint2.token!)).status === 200, "A's second connector still works after B's failed revoke");

  // no auth at all → 401
  ok((await jpost("/connectors/mint", { label: "x" })).status === 401, "mint with no bearer + no sig → 401");

  console.log(`\n${fail === 0 ? "✅ ALL PASS" : "❌ FAIL"} — ${pass} passed, ${fail} failed`);
  done(fail === 0 ? 0 : 1);
} catch (e) {
  console.error("✗ error:", e);
  done(1);
}
