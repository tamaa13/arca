/** Validate the hardening against a real stall: save() must NOT hang — it should
 *  anchor on-chain and return `pending=true` within the upload timeout. */
import { FileKeyManager } from "../src/memory/key.js";
import { OgStorageClient } from "../src/og/storage.js";
import { ogCrypto } from "../src/og/crypto.js";
import { IngatMemoryStore } from "../src/memory/store.js";
import { RegistryClient } from "../src/registry/client.js";
import { OG } from "../src/types.js";

const { privKeyHex } = new FileKeyManager().loadOrCreate();
const registry = OG.registry ? new RegistryClient(privKeyHex) : undefined;
const store = new IngatMemoryStore(
  new OgStorageClient(privKeyHex),
  ogCrypto,
  privKeyHex,
  registry,
);

console.log("network rpc:", OG.rpc);
console.log("registry   :", OG.registry || "(none)");
const t0 = Date.now();
const rec = await store.save("hardening probe — does save() hang on a stall?");
const secs = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`\nsave() returned in ${secs}s`);
console.log("id      :", rec.id);
console.log("rootHash:", rec.rootHash);
console.log("pending :", rec.pending, rec.pending ? "(anchored on-chain, storage upload still syncing)" : "(fully stored on 0G)");
process.exit(0);
