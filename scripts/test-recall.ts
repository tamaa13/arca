/**
 * Unit test for the optimized RemoteMemoryStore.recall (parallel + per-session cache).
 * Mocks 0G storage (per-blob delay + call counter), crypto (passthrough), registry (in-memory).
 * Proves: all records returned, newest-first, dedup, substring filter, PARALLEL (not N×delay),
 * and CACHED (2nd recall does zero new downloads; only NEW roots fetched incrementally).
 * Run: bun scripts/test-recall.ts
 */
import { createHash } from "node:crypto";
import { RemoteMemoryStore } from "../src/memory/remote-store.js";
import type { Crypto, OgStorage } from "../src/types.js";
import type { RegistryClient } from "../src/registry/client.js";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log((c ? "✓ " : "✗ FAIL ") + m); c ? pass++ : fail++; };

const DELAY = 200; // ms per getBlob — makes sequential (N×DELAY) vs parallel (~DELAY) measurable
let getBlobCalls = 0;
const blobs = new Map<string, Uint8Array>();
const sha = (b: Uint8Array) => "0x" + createHash("sha256").update(b).digest("hex");

const storage: OgStorage = {
  async rootOf(bytes) { return sha(bytes); },
  async putBlob(bytes) { const r = sha(bytes); blobs.set(r, bytes); return r; },
  async getBlob(rootHash) {
    getBlobCalls++;
    await new Promise((r) => setTimeout(r, DELAY));
    const b = blobs.get(rootHash);
    if (!b) throw new Error("not found");
    return b;
  },
};
const crypto: Crypto = { encrypt: (p) => p, decrypt: (c) => c }; // passthrough (recall logic under test, not crypto)

const roots: string[] = [];
const registry = {
  async addRootFor(_owner: string, rootHash: string) { roots.push(rootHash); },
  async getRoots(_user: string) { return [...roots]; },
} as unknown as RegistryClient;

const store = new RemoteMemoryStore(storage, crypto, registry, "0xowner");

function isSortedNewestFirst(rs: { createdAt: number }[]): boolean {
  for (let i = 1; i < rs.length; i++) if (rs[i].createdAt > rs[i - 1].createdAt) return false;
  return true;
}

try {
  const N = 12;
  for (let i = 0; i < N; i++) {
    await store.save(`memory number ${i} — token apple-${i}`, { blockUpload: true });
    await new Promise((r) => setTimeout(r, 2)); // ensure distinct createdAt for ordering check
  }
  ok(roots.length === N, `anchored ${N} roots`);

  // First recall: parallel + populates cache.
  getBlobCalls = 0;
  const t0 = Date.now();
  const all = await store.recall();
  const dt = Date.now() - t0;
  ok(all.length === N, `recall returns all ${N} records (got ${all.length})`);
  ok(isSortedNewestFirst(all), "records sorted newest-first");
  ok(getBlobCalls === N, `first recall downloaded each root once (${getBlobCalls})`);
  ok(dt < (N * DELAY) / 2, `recall is PARALLEL: ${dt}ms < sequential ${(N * DELAY)}ms`);

  // Second recall: fully cached → zero new downloads.
  getBlobCalls = 0;
  const again = await store.recall();
  ok(again.length === N, "2nd recall still returns all");
  ok(getBlobCalls === 0, `2nd recall does ZERO downloads (cache hit) — was ${getBlobCalls}`);

  // Substring filter (still no downloads — served from cache).
  getBlobCalls = 0;
  const filtered = await store.recall("apple-7");
  ok(filtered.length === 1 && filtered[0].text.includes("apple-7"), "substring filter returns exactly the match");
  ok(getBlobCalls === 0, "filtered recall uses cache (0 downloads)");

  // Dedup: registry is append-only — duplicate a root, recall must not double-count.
  roots.push(roots[0]);
  getBlobCalls = 0;
  const deduped = await store.recall();
  ok(deduped.length === N, `dedup: still ${N} records despite duplicate root`);
  ok(getBlobCalls === 0, "dedup recall uses cache (0 downloads)");

  // Incremental: a new save → only the NEW root is downloaded next recall.
  await store.save("memory number 12 — token apple-12", { blockUpload: true });
  getBlobCalls = 0;
  const grown = await store.recall();
  ok(grown.length === N + 1, `incremental: now ${N + 1} records`);
  ok(getBlobCalls === 1, `incremental recall downloaded ONLY the new root (${getBlobCalls})`);

  // ── tokenized search (PR #2): whitespace/punctuation-insensitive + order-independent ──
  await store.save("E2E-485D-SECRET special-token", { blockUpload: true });
  ok((await store.recall("E2E secret")).some((r) => r.text.includes("E2E-485D-SECRET")), "tokenized: 'E2E secret' matches 'E2E-485D-SECRET' (the reported bug)");
  ok((await store.recall("secret e2e")).some((r) => r.text.includes("E2E-485D-SECRET")), "tokenized: reordered 'secret e2e' still matches (order-independent)");
  ok((await store.recall("485d-secret")).some((r) => r.text.includes("E2E-485D-SECRET")), "tokenized: punctuation in query ('485d-secret') matches");
  ok((await store.recall("zzznope")).length === 0, "tokenized: non-existent term → no match");
  ok((await store.recall("E2E")).length === 1, "tokenized: 'E2E' matches only the one E2E record");

  // ── limit / bounding (PR #2): newest-first cap + O(limit) download on the no-query path ──
  roots.length = 0; blobs.clear(); getBlobCalls = 0;
  const store2 = new RemoteMemoryStore(storage, crypto, registry, "0xowner");
  for (let i = 0; i < 64; i++) { await store2.save(`bounded entry ${i}`, { blockUpload: true }); await new Promise((r) => setTimeout(r, 1)); }
  getBlobCalls = 0;
  const capped = await store2.recall(); // no query → default limit 50
  ok(capped.length === 50, `default limit caps at 50 newest (got ${capped.length})`);
  ok(capped[0].text === "bounded entry 63", "newest entry is first");
  ok(getBlobCalls === 50, `no-query recall downloaded ONLY the newest 50, not all 64 (${getBlobCalls})`);
  ok((await store2.recall(undefined, 5)).length === 5, "explicit limit=5 → 5 records");
  ok((await store2.recall(undefined, 1000)).length === 64, "limit > total → all 64");

  console.log(`\n${fail === 0 ? "✅ ALL PASS" : "❌ FAIL"} — ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
} catch (e) {
  console.error("✗ error:", e);
  process.exit(1);
}
