/** Phase 1b key-model unit test: wallet-signature-derived AES key.
 *  Proves: deterministic (same wallet → same key), encrypt/decrypt roundtrips,
 *  and a different wallet derives a different key that CANNOT decrypt. No network. */
import { Wallet } from "ethers";
import { deriveMemoryKey, keyedCrypto } from "../src/wallet/sig-key.js";
import type { Crypto } from "../src/types.js";

const signerOf = (w: Wallet) => ({
  signTypedData: (d: unknown, t: unknown, m: unknown) =>
    // ethers Wallet.signTypedData matches our TypedDataSigner surface at runtime.
    (w.signTypedData as (d: unknown, t: unknown, m: unknown) => Promise<string>)(d, t, m),
});

const wallet = Wallet.createRandom();
console.log("test wallet:", wallet.address);

const k1 = await deriveMemoryKey(signerOf(wallet));
const k2 = await deriveMemoryKey(signerOf(wallet));
const deterministic = Buffer.from(k1).equals(Buffer.from(k2));
console.log("1. deterministic (sign twice → same key):", deterministic);

const crypto: Crypto = keyedCrypto(k1);
const secret = "secret memory — only my wallet can read this";
const ct = await crypto.encrypt(new TextEncoder().encode(secret), "");
const back = new TextDecoder().decode(await crypto.decrypt(ct, ""));
const roundtrips = back === secret;
console.log("2. encrypt → decrypt roundtrip:", roundtrips, `("${back}")`);

const other = Wallet.createRandom();
const k3 = await deriveMemoryKey(signerOf(other));
const differentKey = !Buffer.from(k1).equals(Buffer.from(k3));
let blocked = false;
try {
  await keyedCrypto(k3).decrypt(ct, "");
} catch {
  blocked = true;
}
console.log("3. other wallet → different key:", differentKey, "| can't decrypt:", blocked);

const pass = deterministic && roundtrips && differentKey && blocked;
console.log(pass ? "\n✅ 1b key-model PASS" : "\n❌ FAIL");
process.exit(pass ? 0 : 1);
