/** Full OAuth 2.1 E2E against a running Arca server (BASE env, default localhost:8799). */
import { Wallet } from "ethers";
import { createHash, randomBytes } from "node:crypto";

const BASE = process.env.BASE || "http://localhost:8799";
const DOMAIN = { name: "Arca", version: "1" };
const TYPES = { ArcaKey: [{ name: "purpose", type: "string" }, { name: "scope", type: "string" }] };
const MESSAGE = { purpose: "Derive your Arca memory encryption key.", scope: "memory-v1" };
const b64url = (b: Buffer) => b.toString("base64url");
const redirect_uri = "https://claude.ai/api/mcp/auth_callback";
const initBody = { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "e2e", version: "1.0" } } };

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log((c ? "✓ " : "✗ FAIL ") + m); c ? pass++ : fail++; };
const jstr = (v: unknown) => JSON.stringify(v);

// ── discovery ──
const prm = await (await fetch(`${BASE}/.well-known/oauth-protected-resource`)).json();
ok(prm.authorization_servers?.[0] === BASE && prm.resource === `${BASE}/mcp`, "discovery: protected-resource metadata");
const asm = await (await fetch(`${BASE}/.well-known/oauth-authorization-server`)).json();
ok(jstr(asm.token_endpoint_auth_methods_supported) === jstr(["none"]), "discovery: auth_methods = [none] (PKCE-only)");
ok(jstr(asm.code_challenge_methods_supported) === jstr(["S256"]), "discovery: S256 only");

// ── DCR ──
const reg = await (await fetch(`${BASE}/register`, { method: "POST", headers: { "content-type": "application/json" }, body: jstr({ client_name: "e2e", redirect_uris: [redirect_uri] }) })).json();
ok(!!reg.client_id && !reg.client_secret && reg.token_endpoint_auth_method === "none", "DCR: client_id + NO secret + method none");
const client_id = reg.client_id;

// ── PKCE ──
const verifier = b64url(randomBytes(32));
const challenge = b64url(createHash("sha256").update(verifier).digest());
const resource = `${BASE}/mcp`;
const authzUrl = `${BASE}/authorize?response_type=code&client_id=${client_id}&redirect_uri=${encodeURIComponent(redirect_uri)}&code_challenge=${challenge}&code_challenge_method=S256&state=xyz&resource=${encodeURIComponent(resource)}`;

// A FRESH GET /authorize → a single-use arca_authz cookie (FIX 7: each authorize cookie
// redeems exactly one approve, so every minting approve needs its own fresh cookie).
const freshCookie = async (): Promise<string> => {
  const r = await fetch(authzUrl, { redirect: "manual" });
  const c = /(arca_authz=[^;]+)/.exec(r.headers.get("set-cookie") || "")?.[1];
  if (r.status !== 200 || !c) throw new Error(`GET /authorize failed: ${r.status}`);
  return c;
};
const cookie = await freshCookie();
ok(!!cookie, "GET /authorize: 200 + sets arca_authz cookie");

const wallet = Wallet.createRandom();
const sig = await wallet.signTypedData(DOMAIN, TYPES, MESSAGE);
const approve = (hdr: Record<string, string>, extra: Record<string, unknown> = {}) =>
  fetch(`${BASE}/authorize/approve`, { method: "POST", headers: { "content-type": "application/json", ...hdr }, body: jstr({ wallet: wallet.address, signature: sig, client_id, redirect_uri, code_challenge: challenge, code_challenge_method: "S256", state: "xyz", resource, ...extra }) });
const tokenReq = (params: Record<string, string>) =>
  fetch(`${BASE}/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(params) });

// ── negative: approve without cookie (session fixation) ──
ok((await approve({})).status === 400, "approve WITHOUT cookie → 400 (session-fixation blocked)");
// ── negative: approve with bogus resource ──
const bogus = await approve({ cookie: cookie! }, { resource: "https://evil.example/mcp" });
ok(bogus.status === 400 && (await bogus.json()).error === "invalid_target", "approve bogus resource → invalid_target");

// ── happy: approve → code → token → /mcp (the original `cookie` is still un-spent here:
//     the no-cookie + bogus-resource negatives above never reached the nonce check) ──
const a1 = await approve({ cookie: cookie! });
const code1 = new URL((await a1.json()).redirect).searchParams.get("code")!;
ok(a1.status === 200 && !!code1, "approve WITH cookie → code");
const t1 = await tokenReq({ grant_type: "authorization_code", code: code1, code_verifier: verifier, redirect_uri, client_id });
const tok = await t1.json();
ok(t1.status === 200 && !!tok.access_token && !!tok.refresh_token, "token: access+refresh issued");
// code replay
ok((await tokenReq({ grant_type: "authorization_code", code: code1, code_verifier: verifier, redirect_uri, client_id })).status === 400, "token: code replay → 400");
// nonce single-use (FIX 7): REUSING that now-spent cookie for a second approve → 400
ok((await approve({ cookie: cookie! })).status === 400, "approve REUSING spent cookie → 400 (nonce single-use)");
// PKCE fail on a fresh code (FRESH cookie — the spent one would 400 on the approve itself)
const code2 = new URL((await (await approve({ cookie: await freshCookie() })).json()).redirect).searchParams.get("code")!;
ok((await tokenReq({ grant_type: "authorization_code", code: code2, code_verifier: "wrong-verifier", redirect_uri, client_id })).status === 400, "token: wrong PKCE verifier → 400");

// ── /mcp with OAuth access token → 200; without → 401 + WWW-Authenticate ──
const mcpHdr = { "content-type": "application/json", accept: "application/json, text/event-stream" };
const withTok = await fetch(`${BASE}/mcp`, { method: "POST", headers: { ...mcpHdr, authorization: `Bearer ${tok.access_token}` }, body: jstr(initBody) });
ok(withTok.status === 200, "/mcp initialize WITH OAuth token → 200 (resolves to session)");
const sid = withTok.headers.get("mcp-session-id") || "";
ok(!!sid, "/mcp initialize → returns mcp-session-id");
const noTok = await fetch(`${BASE}/mcp`, { method: "POST", headers: mcpHdr, body: jstr(initBody) });
ok(noTok.status === 401 && (noTok.headers.get("www-authenticate") || "").includes("resource_metadata"), "/mcp no token → 401 + WWW-Authenticate");

// ── FIX 3: per-request bearer re-validation — a leaked Mcp-Session-Id is NOT a credential.
//    Reuse the valid session id but drop / swap the bearer → BOTH must 401 (auth re-checked
//    on every request, not just at initialize). A non-init JSON-RPC call carries the sid. ──
const followBody = { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} };
const reuseNoAuth = await fetch(`${BASE}/mcp`, { method: "POST", headers: { ...mcpHdr, "mcp-session-id": sid }, body: jstr(followBody) });
ok(reuseNoAuth.status === 401, "/mcp reuse session id with NO bearer → 401 (per-request auth)");
const reuseBadAuth = await fetch(`${BASE}/mcp`, { method: "POST", headers: { ...mcpHdr, "mcp-session-id": sid, authorization: "Bearer garbage_not_a_real_token" }, body: jstr(followBody) });
ok(reuseBadAuth.status === 401, "/mcp reuse session id with WRONG bearer → 401 (per-request auth)");

// ── refresh rotation + reuse detection ──
const r1 = await tokenReq({ grant_type: "refresh_token", refresh_token: tok.refresh_token, client_id });
const rtok = await r1.json();
ok(r1.status === 200 && !!rtok.access_token && rtok.refresh_token !== tok.refresh_token, "refresh: rotated (new refresh)");
ok((await tokenReq({ grant_type: "refresh_token", refresh_token: tok.refresh_token, client_id })).status === 400, "refresh: REUSE old token → 400 (family revoked)");
// after family revoke, the rotated refresh is also dead
ok((await tokenReq({ grant_type: "refresh_token", refresh_token: rtok.refresh_token, client_id })).status === 400, "refresh: family revoked → rotated token also dead");

console.log(`\n${fail === 0 ? "✅ ALL PASS" : "❌ FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
