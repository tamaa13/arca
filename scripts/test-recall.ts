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

  console.log(`\n${fail === 0 ? "✅ ALL PASS" : "❌ FAIL"} — ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
} catch (e) {
  console.error("✗ error:", e);
  process.exit(1);
}
