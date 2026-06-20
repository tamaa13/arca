/**
 * Real mainnet roundtrip test for the Ingat hero loop.
 *   (no flag) — load/create the key, print address + balance + registry.
 *   --run    — full loop: save -> 0G + on-chain anchor -> recall -> verify.
 */
import { ethers } from "ethers";
import { FileKeyManager } from "../src/memory/key.js";
import { OgStorageClient } from "../src/og/storage.js";
import { ogCrypto } from "../src/og/crypto.js";
import { IngatMemoryStore } from "../src/memory/store.js";
import { RegistryClient } from "../src/registry/client.js";
import { OG } from "../src/types.js";

const { privKeyHex, address } = new FileKeyManager().loadOrCreate();
const provider = new ethers.JsonRpcProvider(OG.rpc);
const bal = await provider.getBalance(address);

console.log("INGAT_ADDRESS:", address);
console.log("balance     :", ethers.formatEther(bal), "OG");
console.log("registry    :", OG.registry || "(INGAT_REGISTRY_ADDR not set)");

if (process.argv.includes("--run")) {
  if (bal === 0n) {
    console.error("\n⚠ wallet not funded yet — fund the address above, then re-run with --run");
    process.exit(1);
  }
  const registry = OG.registry ? new RegistryClient(privKeyHex) : undefined;
  const store = new IngatMemoryStore(new OgStorageClient(privKeyHex), ogCrypto, privKeyHex, registry);

  const fact = "Tama prefers Hono + Drizzle + Neon Postgres, functional style, Lucia auth, handle 'dev'.";
  console.log("\n=== SAVE (encrypt -> 0G Storage -> anchor on 0G Chain) ===");
  const rec = await store.save(fact);
  console.log("saved id  :", rec.id);
  console.log("rootHash  :", rec.rootHash);

  console.log("\n=== RECALL (fetch from 0G -> decrypt) — query 'drizzle' ===");
  const recs = await store.recall("drizzle");
  console.log("recalled  :", recs.length, "record(s)");
  for (const r of recs) console.log("  -", r.text);

  if (registry) {
    const roots = await registry.getRoots(address);
    console.log("\n=== on-chain registry ===");
    console.log("roots anchored for this address:", roots.length);
    for (const r of roots) console.log("  ", r);
  }

  const ok = recs.some((r) => r.text === fact);
  console.log(ok ? "\n✅ ROUNDTRIP PASS — wrote to 0G, read it back decrypted." : "\n❌ roundtrip mismatch");
  process.exit(ok ? 0 : 1);
}
