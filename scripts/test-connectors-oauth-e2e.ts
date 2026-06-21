/**
 * E2E: an OAuth web client (claude.ai / ChatGPT) becomes a LISTABLE, INDIVIDUALLY-REVOCABLE
 * connector. Drives the full redirect flow over real HTTP — register → authorize (cookie) →
 * approve (wallet sign) → token (PKCE) — then proves:
 *   - a `kind:oauth` connector row appears in GET /connectors after token issuance,
 *   - the OAuth access token authenticates /mcp,
 *   - revoking THAT row (management sig) kills the token family → /mcp 401,
 *   - a co-existing CLI connector for the same wallet KEEPS working (selective ✓).
 * Run: bun scripts/test-connectors-oauth-e2e.ts
 */
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { Wallet } from "ethers";
import { ARCA_KEY_DOMAIN, ARCA_KEY_TYPES, arcaKeyMessage } from "../src/wallet/sig-key.js";
import { connectorMgmtMessage } from "../src/auth/connectors.js";

const PORT = "8792";
const BASE = `http://localhost:${PORT}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log((c ? "✓ " : "✗ FAIL ") + m); c ? pass++ : fail++; };
const b64url = (b: Buffer) => b.toString("base64url");
const mcpHdr = { "content-type": "application/json", accept: "application/json, text/event-stream" };
const init = { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "oauth-e2e", version: "1" } } };
const follow = { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} };

const W = Wallet.createRandom();
const REDIRECT = "https://claude.ai/api/mcp/auth_callback";
const server = spawn("bun", ["src/transport/http-server.ts"], {
  env: { ...process.env, ARCA_PORT: PORT, ARCA_CONNECTORS_FILE: "/tmp/arca-conn-oauth-e2e.json", ARCA_PUBLIC_URL: BASE, ARCA_REGISTRY_ADDR: "0xc196C28886c93462f55A78134b5bF6118A3f5860" },
  stdio: "inherit",
});
const done = (code: number) => { try { server.kill("SIGKILL"); } catch {} process.exit(code); };
const jpost = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${BASE}${path}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

async function mcpInit(token: string) {
  const r = await fetch(`${BASE}/mcp`, { method: "POST", headers: { ...mcpHdr, authorization: `Bearer ${token}` }, body: JSON.stringify(init) });
  return { status: r.status, sid: r.headers.get("mcp-session-id") };
}
const mcpFollow = async (token: string, sid: string) =>
  (await fetch(`${BASE}/mcp`, { method: "POST", headers: { ...mcpHdr, authorization: `Bearer ${token}`, "mcp-session-id": sid }, body: JSON.stringify(follow) })).status;

try {
  for (let i = 0; ; i++) { try { if ((await fetch(`${BASE}/health`)).ok) break; } catch {} if (i > 40) throw new Error("server not healthy"); await sleep(250); }
  console.log("✓ server healthy");

  // The wallet must have a LIVE session (the OAuth code binds to it + the memory key in RAM).
  const sig = await W.signTypedData(ARCA_KEY_DOMAIN, ARCA_KEY_TYPES, arcaKeyMessage());
  ok((await jpost("/session", { wallet: W.address, signature: sig })).ok, "/session created (key in RAM)");

  // Also mint a CLI connector for the SAME wallet — it must survive the web revoke (selective).
  const cliIssued = Date.now();
  const cliSig = await W.signMessage(connectorMgmtMessage({ action: "add", wallet: W.address, label: "Codex-cli", issuedAt: cliIssued }));
  const cli = (await (await jpost("/connectors/mint", { wallet: W.address, label: "Codex-cli", issuedAt: cliIssued, signature: cliSig })).json()) as { token: string };
  const iCli = await mcpInit(cli.token); ok(iCli.status === 200, "CLI connector authenticates /mcp");

  // (1) DCR — register the web client.
  const reg = (await (await jpost("/register", { client_name: "claude.ai", redirect_uris: [REDIRECT] })).json()) as { client_id: string };
  ok(!!reg.client_id, "registered OAuth client (DCR)");

  // (2) PKCE pair + GET /authorize to obtain the anti-fixation cookie.
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  const authzUrl = `${BASE}/authorize?response_type=code&client_id=${reg.client_id}&redirect_uri=${encodeURIComponent(REDIRECT)}&code_challenge=${challenge}&code_challenge_method=S256&state=xyz`;
  const authzRes = await fetch(authzUrl, { redirect: "manual" });
  const setCookie = authzRes.headers.get("set-cookie") ?? "";
  const cookie = /(arca_authz=[^;]+)/.exec(setCookie)?.[1] ?? "";
  ok(!!cookie, "GET /authorize set the arca_authz cookie");

  // (3) Approve — the SAME wallet signs the Arca EIP-712; carries the cookie + OAuth params.
  const approve = (await (await jpost("/authorize/approve", {
    wallet: W.address, signature: sig,
    client_id: reg.client_id, redirect_uri: REDIRECT,
    code_challenge: challenge, code_challenge_method: "S256", state: "xyz",
  }, { cookie })).json()) as { redirect?: string };
  const code = approve.redirect ? new URL(approve.redirect).searchParams.get("code") : null;
  ok(!!code, "POST /authorize/approve returned an auth code");

  // (4) Token exchange (authorization_code + PKCE) → access token + connector row is born here.
  const tok = (await (await fetch(`${BASE}/token`, {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code: code!, redirect_uri: REDIRECT, client_id: reg.client_id, code_verifier: verifier }),
  })).json()) as { access_token?: string };
  ok(!!tok.access_token, "POST /token issued an access token");

  // (5) The web connection is now a listable connector row.
  const list = (await (await fetch(`${BASE}/connectors`, { headers: { authorization: `Bearer ${tok.access_token}` } })).json()) as { connectors?: { id: string; label: string; kind: string }[] };
  const oauthRow = list.connectors?.find((c) => c.kind === "oauth");
  ok(!!oauthRow, "GET /connectors lists the web client as kind:oauth");
  ok(oauthRow?.label === "claude.ai", `web connector label = client_name ("${oauthRow?.label}")`);
  ok((list.connectors?.length ?? 0) === 2, "list shows BOTH the CLI + web connectors");

  // (6) The OAuth access token authenticates /mcp.
  const iWeb = await mcpInit(tok.access_token!); ok(iWeb.status === 200 && !!iWeb.sid, "OAuth access token authenticates /mcp");

  // (7) Revoke ONLY the web connector (management sig) → family killed → access token dies.
  const rIssued = Date.now();
  const rSig = await W.signMessage(connectorMgmtMessage({ action: "revoke", wallet: W.address, connectorId: oauthRow!.id, issuedAt: rIssued }));
  ok((await jpost("/connectors/revoke", { wallet: W.address, connectorId: oauthRow!.id, issuedAt: rIssued, signature: rSig })).ok, "revoke web connector → ok");
  ok((await mcpFollow(tok.access_token!, iWeb.sid!)) === 401, "revoked web → OAuth token 401s on next /mcp (family killed)");
  ok((await mcpInit(tok.access_token!)).status === 401, "revoked web → OAuth token 401s on a fresh init too");

  // (8) The CLI connector for the same wallet is UNTOUCHED — selective revoke proven.
  ok((await mcpFollow(cli.token, iCli.sid!)) === 200, "CLI connector STILL WORKS after web revoked — SELECTIVE ✓");

  console.log(`\n${fail === 0 ? "✅ ALL PASS" : "❌ FAIL"} — ${pass} passed, ${fail} failed`);
  done(fail === 0 ? 0 : 1);
} catch (e) {
  console.error("✗ error:", e);
  done(1);
}
