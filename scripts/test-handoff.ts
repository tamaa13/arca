/** Option-3 ECIES handoff roundtrip + tamper test. */
import { Wallet } from "ethers";
import { generateBootstrapKeypair, encryptToPubkey, decryptWithPrivkey } from "../src/sandbox/handoff.js";

// the container generates a bootstrap keypair (privkey stays in the enclave)
const boot = generateBootstrapKeypair();

// the dashboard encrypts a user's EIP-712 signature to the container pubkey
const userSig = (await Wallet.createRandom().signMessage("a realistic 65-byte secret")).slice(0, 132);
const secret = new TextEncoder().encode(userSig);
const env = encryptToPubkey(boot.pubkeyHexCompressed, secret);
console.log("envelope ephPub:", env.ephPubkeyHex.slice(0, 18) + "…", "| ct bytes:", (env.ciphertextHex.length - 2) / 2);

// inside the enclave: decrypt with the bootstrap privkey
const out = new TextDecoder().decode(decryptWithPrivkey(boot.privkeyHex, env));
const roundtrip = out === userSig;
console.log("roundtrip decrypt matches:", roundtrip);

// a wrong key must fail (the relay/operator, holding no bootstrap privkey, can't read it)
let blocked = false;
try {
  decryptWithPrivkey(Wallet.createRandom().privateKey, env);
} catch {
  blocked = true;
}
console.log("wrong-key decrypt blocked:", blocked);

const pass = roundtrip && blocked;
console.log(pass ? "\n✅ HANDOFF PASS — secret reaches the enclave; relay/operator can't decrypt" : "\n❌ FAIL");
process.exit(pass ? 0 : 1);
