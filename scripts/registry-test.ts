/** Prove the 0G CHAIN half (ArcaRegistry) works independently of storage-node lag. */
import { FileKeyManager } from "../src/memory/key.js";
import { RegistryClient } from "../src/registry/client.js";

const { privKeyHex, address } = new FileKeyManager().loadOrCreate();
const reg = new RegistryClient(privKeyHex);

// the real root the save() computed for "Tama prefers Hono+Drizzle..." (blob is on-chain via Flow,
// just not yet finalized on the lagging storage nodes)
const root = "0x5853b43d3589804b4d2e965c0cbfa4188684f4260e59ac19bfa17679db189eb9";

console.log("address       :", address);
console.log("registry      :", reg.address);
console.log("anchoring root:", root);
await reg.addRoot(root);
console.log("✅ addRoot tx confirmed");

const roots = await reg.getRoots(address);
console.log("getRoots(", address, ") =>", roots.length, "root(s):");
for (const r of roots) console.log("  ", r);
console.log(roots.includes(root) ? "✅ REGISTRY ROUNDTRIP PASS — root anchored + read back on 0G Chain" : "❌ root not found");
