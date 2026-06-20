/** Fetch ONE blob from 0G Storage (current network) + decrypt with a given key.
 *  usage: npx tsx scripts/recall-root.ts <rootHash> [keyFile]
 *  keyFile defaults to ~/.arca/key.funded.bak (the 0xea7b wallet that saved the first mainnet memory). */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { OgStorageClient } from "../src/og/storage.js";
import { ogCrypto } from "../src/og/crypto.js";
import { OG } from "../src/types.js";

const root = process.argv[2] ?? "0x5853b43d3589804b4d2e965c0cbfa4188684f4260e59ac19bfa17679db189eb9";
const keyFile = process.argv[3] ?? path.join(os.homedir(), ".arca", "key.funded.bak");
const key = fs.readFileSync(keyFile, "utf8").trim();

const storage = new OgStorageClient(key);
console.log("network :", OG.rpc, "(chainId", OG.chainId + ")");
console.log("root    :", root);
console.log("key file:", keyFile, `(${new (await import("ethers")).Wallet(key).address})`);

console.log("\n→ fetching encrypted blob from 0G Storage…");
const ciphertext = await storage.getBlob(root);
console.log(`  got ${ciphertext.length} bytes ciphertext`);

console.log("→ decrypting with the wallet key…");
const plaintext = await ogCrypto.decrypt(ciphertext, key);
const record = JSON.parse(new TextDecoder().decode(plaintext));
console.log("\n✅ MAINNET READ-BACK — decrypted memory:");
console.log("   text     :", record.text);
console.log("   id       :", record.id);
console.log("   createdAt:", new Date(record.createdAt).toISOString());
