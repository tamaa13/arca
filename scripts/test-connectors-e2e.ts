/**
 * E2E: per-connector tokens + selective revoke over real HTTP.
 * Boots the server, mints 2 connector tokens for one wallet, proves each authenticates
 * /mcp, then revokes ONE and proves it 401s while the OTHER still works.
 * Run: bun scripts/test-connectors-e2e.ts
 */
import { spawn } from "node:child_process";
import { Wallet } from "ethers";
import { ARCA_KEY_DOMAIN, ARCA_KEY_TYPES, arcaKeyMessage } from "../src/wallet/sig-key.js";
import { connectorMgmtMessage } from "../src/auth/connectors.js";

const PORT = "8791";
const BASE = `http://localhost:${PORT}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log((c ? "✓ " : "✗ FAIL ") + m); c ? pass++ : fail++; };
const mcpHdr = { "content-type": "application/json", accept: "application/json, text/event-stream" };
const init = { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "e2e", version: "1" } } };
const follow = { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} };

const W = Wallet.createRandom();
const server = spawn("bun", ["src/transport/http-server.ts"], {
  env: { ...process.env, ARCA_PORT: PORT, ARCA_CONNECTORS_FILE: "/tmp/arca-conn-e2e.json", ARCA_REGISTRY_ADDR: "0xc196C28886c93462f55A78134b5bF6118A3f5860" },
  stdio: "inherit",
});
const done = (code: number) => { try { server.kill("SIGKILL"); } catch {} process.exit(code); };

const jpost = (path: string, body: unknown) =>
  fetch(`${BASE}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

async function mint(label: string): Promise<{ token: string; id: string }> {
  const issuedAt = Date.now();
  const signature = await W.signMessage(connectorMgmtMessage({ action: "add", wallet: W.address, label, issuedAt }));
  const j = (await (await jpost("/connectors/mint", { wallet: W.address, label, issuedAt, signature })).json()) as { token?: string; id?: string };
  if (!j.token || !j.id) throw new Error("mint failed: " + JSON.stringify(j));
  return { token: j.token, id: j.id };
}
async function revoke(connectorId: string) {
  const issuedAt = Date.now();
  const signature = await W.signMessage(connectorMgmtMessage({ action: "revoke", wallet: W.address, connectorId, issuedAt }));
  return jpost("/connectors/revoke", { wallet: W.address, connectorId, issuedAt, signature });
}
async function mcpInit(token: string) {
  const r = await fetch(`${BASE}/mcp`, { method: "POST", headers: { ...mcpHdr, authorization: `Bearer ${token}` }, body: JSON.stringify(init) });
  return { status: r.status, sid: r.headers.get("mcp-session-id") };
}
const mcpFollow = async (token: string, sid: string) =>
  (await fetch(`${BASE}/mcp`, { method: "POST", headers: { ...mcpHdr, authorization: `Bearer ${token}`, "mcp-session-id": sid }, body: JSON.stringify(follow) })).status;

try {
  for (let i = 0; ; i++) { try { if ((await fetch(`${BASE}/health`)).ok) break; } catch {} if (i > 40) throw new Error("server not healthy"); await sleep(250); }
  console.log("✓ server healthy");

  const sig = await W.signTypedData(ARCA_KEY_DOMAIN, ARCA_KEY_TYPES, arcaKeyMessage());
  ok((await jpost("/session", { wallet: W.address, signature: sig })).ok, "/session created (key in RAM)");

  const A = await mint("Codex-laptop");
  const B = await mint("Claude-desktop");
  ok(A.token.startsWith("arca_live_") && B.token !== A.token, "minted 2 DISTINCT connector tokens");

  const iA = await mcpInit(A.token); ok(iA.status === 200 && !!iA.sid, "connector A authenticates /mcp init");
  const iB = await mcpInit(B.token); ok(iB.status === 200 && !!iB.sid, "connector B authenticates /mcp init");
  ok((await mcpFollow(A.token, iA.sid!)) === 200, "A follow-up OK (reauthorized per-request)");

  const list = (await (await fetch(`${BASE}/connectors`, { headers: { authorization: `Bearer ${A.token}` } })).json()) as { connectors?: { id: string; label: string }[] };
  ok(list.connectors?.length === 2, "GET /connectors lists both (bearer-authed)");

  ok((await revoke(A.id)).ok, "revoke A → ok (management sig)");
  ok((await mcpFollow(A.token, iA.sid!)) === 401, "revoked A → 401 on next request");
  ok((await mcpFollow(B.token, iB.sid!)) === 200, "B STILL WORKS after A revoked — SELECTIVE ✓");
  ok((await mcpInit(A.token)).status === 401, "revoked A → 401 on a fresh init too");

  // wrong-wallet revoke rejected
  const stranger = Wallet.createRandom();
  const ts = Date.now();
  const badSig = await stranger.signMessage(connectorMgmtMessage({ action: "revoke", wallet: W.address, connectorId: B.id, issuedAt: ts }));
  ok((await jpost("/connectors/revoke", { wallet: W.address, connectorId: B.id, issuedAt: ts, signature: badSig })).status === 401, "stranger revoke of B → 401 (sig-mismatch)");
  ok((await mcpFollow(B.token, iB.sid!)) === 200, "B survives the foreign revoke attempt");

  console.log(`\n${fail === 0 ? "✅ ALL PASS" : "❌ FAIL"} — ${pass} passed, ${fail} failed`);
  done(fail === 0 ? 0 : 1);
} catch (e) {
  console.error("✗ error:", e);
  done(1);
}
