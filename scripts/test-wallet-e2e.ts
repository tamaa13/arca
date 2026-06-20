/** Phase 1b end-to-end: a memory encrypted with a WALLET-derived key, pushed through
 *  the real 0G pipeline (store → 0G Storage + ArcaRegistry → recall → decrypt).
 *  0G gas is signed by the funded key (~/.arca/key) — the deposit/session-signer model,
 *  simplified. The ENCRYPTION key is the user's wallet-signature-derived key. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Wallet } from "ethers";
import { OgStorageClient } from "../src/og/storage.js";
import { RegistryClient } from "../src/registry/client.js";
import { ArcaMemoryStore } from "../src/memory/store.js";
import { OG } from "../src/types.js";
import { deriveMemoryKey, keyedCrypto } from "../src/wallet/sig-key.js";

const fundedKey = fs.readFileSync(path.join(os.homedir(), ".arca", "key"), "utf8").trim();
fs.rmSync(path.join(os.homedir(), ".arca", "index.json"), { force: true });

const userWallet = Wallet.createRandom();
const signer = {
  signTypedData: (d: unknown, t: unknown, m: unknown) =>
    (userWallet.signTypedData as (d: unknown, t: unknown, m: unknown) => Promise<string>)(d, t, m),
};
const walletKey = await deriveMemoryKey(signer);
console.log("user wallet (enc-key source):", userWallet.address);
console.log("0G gas signer (funded):       ", new Wallet(fundedKey).address);

const store = new ArcaMemoryStore(
  new OgStorageClient(fundedKey),
  keyedCrypto(walletKey), // ← encryption keyed to the WALLET signature
  fundedKey, // ← 0G gas signer (session-signer model)
  OG.registry ? new RegistryClient(fundedKey) : undefined,
);

const marker = `wallet-key e2e ${Date.now()}`;
const rec = await store.save(marker);
console.log("saved:", rec.id, "| pending:", rec.pending);

let found = "";
for (let i = 0; i < 10; i++) {
  await new Promise((r) => setTimeout(r, 5000));
  const hits = await store.recall("wallet-key");
  const hit = hits.find((r) => r.text === marker);
  if (hit) {
    found = hit.text;
    console.log(`recall (try ${i + 1}): found`);
    break;
  }
  console.log(`recall (try ${i + 1}): not finalized yet…`);
}

console.log(
  found
    ? `\n✅ 1b wallet-e2e PASS — encrypted with wallet-derived key → 0G → recalled + decrypted:\n   "${found}"`
    : "\n❌ not finalized",
);
process.exit(found ? 0 : 1);
