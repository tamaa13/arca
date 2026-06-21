/**
 * Unit tests for the per-connector token store + management-sig.
 * Run: ARCA_CONNECTORS_FILE=/tmp/arca-conn-test.json bun scripts/test-connectors.ts
 */
import { Wallet } from "ethers";
import {
  __resetConnectorsForTest,
  connectorMgmtMessage,
  listConnectors,
  loadConnectors,
  mintConnector,
  resolveConnector,
  revokeAllConnectors,
  revokeConnector,
  verifyMgmtSig,
} from "../src/auth/connectors.js";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log((c ? "✓ " : "✗ FAIL ") + m); c ? pass++ : fail++; };

const W = Wallet.createRandom();
const wallet = W.address;

// ── mint + resolve ──
__resetConnectorsForTest();
const a = mintConnector({ wallet, label: "Codex-laptop", kind: "cli" });
ok(a.token.startsWith("arca_live_"), "mint: returns arca_live_ token");
ok(resolveConnector(a.token)?.label === "Codex-laptop", "resolve: valid token → row");
ok(resolveConnector("arca_live_bogus") === null, "resolve: unknown token → null");

// ── second connector, independent ──
const b = mintConnector({ wallet, label: "Claude-desktop", kind: "cli" });
ok(listConnectors(wallet).length === 2, "list: 2 connectors for wallet");
ok(resolveConnector(a.token) !== null && resolveConnector(b.token) !== null, "both resolve before revoke");

// ── selective revoke: kill A only ──
const revd = revokeConnector(wallet, a.row.hash);
ok(revd?.hash === a.row.hash, "revoke: returns the revoked row");
ok(resolveConnector(a.token) === null, "revoke: A no longer resolves");
ok(resolveConnector(b.token) !== null, "revoke: B STILL resolves (selective ✓)");
ok(listConnectors(wallet).find((c) => c.id === a.row.hash)?.revoked === true, "list: A shows revoked=true");

// ── revoke by wrong wallet rejected ──
ok(revokeConnector(Wallet.createRandom().address, b.row.hash) === null, "revoke: wrong wallet → null (B untouched)");
ok(resolveConnector(b.token) !== null, "B still alive after foreign revoke attempt");

// ── expiry ──
__resetConnectorsForTest();
const exp = mintConnector({ wallet, label: "short", kind: "cli", ttlS: -1 }); // already expired
ok(resolveConnector(exp.token) === null, "expiry: expired token → null");
const never = mintConnector({ wallet, label: "never", kind: "cli", ttlS: 0 });
ok(resolveConnector(never.token) !== null && never.row.expiresAt === 0, "expiry: ttl 0 = never expires");

// ── revoke-all ──
mintConnector({ wallet, label: "x", kind: "cli" });
const all = revokeAllConnectors(wallet);
ok(all.length >= 1 && listConnectors(wallet).every((c) => c.revoked), "revoke-all: every connector revoked");

// ── management signature ──
const issuedAt = Date.now();
const msg = connectorMgmtMessage({ action: "revoke", wallet, connectorId: a.row.hash, issuedAt });
const sig = await W.signMessage(msg);
ok((await Promise.resolve(verifyMgmtSig({ wallet, message: msg, signature: sig, issuedAt }))).ok, "mgmt-sig: valid → ok");
ok(verifyMgmtSig({ wallet, message: msg, signature: sig, issuedAt }).reason === "replay", "mgmt-sig: same sig again → replay");
const msg2 = connectorMgmtMessage({ action: "add", wallet, label: "New", issuedAt });
const sig2 = await W.signMessage(msg2);
ok(verifyMgmtSig({ wallet, message: msg2, signature: sig2, issuedAt: issuedAt - 10 * 60 * 1000 }).reason === "ts-stale", "mgmt-sig: stale issuedAt → ts-stale");
ok(verifyMgmtSig({ wallet, message: msg2, signature: sig2, issuedAt: Date.now() + 2 * 60 * 1000 }).reason === "ts-future", "mgmt-sig: future issuedAt → ts-future");
const msg3 = connectorMgmtMessage({ action: "add", wallet, label: "Z", issuedAt: Date.now() });
const sig3 = await W.signMessage(msg3);
ok(verifyMgmtSig({ wallet: Wallet.createRandom().address, message: msg3, signature: sig3, issuedAt: Date.now() }).reason === "sig-mismatch", "mgmt-sig: wrong wallet → sig-mismatch");

// ── persistence round-trip (mint → reset in-memory → reload from disk → resolve) ──
__resetConnectorsForTest();
const p = mintConnector({ wallet, label: "persist-me", kind: "cli" }); // persisted to ARCA_CONNECTORS_FILE
__resetConnectorsForTest(); // simulate restart (in-memory cleared)
loadConnectors(); // reload from disk
ok(resolveConnector(p.token)?.label === "persist-me", "persist: token resolves after reset+reload (survives restart)");
ok(listConnectors(wallet).length >= 1, "persist: wallet index rebuilt from disk");

console.log(`\n${fail === 0 ? "✅ ALL PASS" : "❌ FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
