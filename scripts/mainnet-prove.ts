/** Close the mainnet read-back proof: fresh save that BLOCKS until the blob is
 *  finalized on 0G Storage (no timeout), then fetch + decrypt it back. */
import { FileKeyManager } from "../src/memory/key.js";
import { OgStorageClient } from "../src/og/storage.js";
import { ogCrypto } from "../src/og/crypto.js";
import { RegistryClient } from "../src/registry/client.js";
import { OG } from "../src/types.js";

const { privKeyHex, address } = new FileKeyManager().loadOrCreate();
const storage = new OgStorageClient(privKeyHex);
const registry = OG.registry ? new RegistryClient(privKeyHex) : undefined;

console.log("network:", OG.rpc, "(chainId", OG.chainId + ")");
console.log("address:", address);

const fact = `mainnet read-back proof for ${address.slice(0, 10)}`;
const record = { id: globalThis.crypto.randomUUID(), text: fact, createdAt: Date.now() };
const ciphertext = await ogCrypto.encrypt(new TextEncoder().encode(JSON.stringify(record)), privKeyHex);

console.log("\n[1/3] SAVE — putBlob BLOCKING until finalized (waits for network catch-up)…");
const t0 = Date.now();
const rootHash = await storage.putBlob(ciphertext);
console.log(`  ✓ finalized in ${((Date.now() - t0) / 1000).toFixed(0)}s, root: ${rootHash}`);

if (registry) {
  await registry.addRoot(rootHash);
  console.log("  ✓ anchored on 0G Chain (mainnet registry)");
}

console.log("\n[2/3] RECALL — fetch the blob back from 0G Storage…");
const blob = await storage.getBlob(rootHash);
console.log(`  ✓ retrieved ${blob.length} bytes`);

console.log("\n[3/3] DECRYPT…");
const back = JSON.parse(new TextDecoder().decode(await ogCrypto.decrypt(blob, privKeyHex)));
console.log(
  back.text === fact
    ? `\n✅ MAINNET READ-BACK PASS — wrote, finalized, fetched, decrypted: "${back.text}"`
    : "\n❌ mismatch",
);
process.exit(back.text === fact ? 0 : 1);
