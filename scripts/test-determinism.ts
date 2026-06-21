import { Wallet } from "ethers";
import {
  ARCA_KEY_DOMAIN, ARCA_KEY_TYPES, arcaKeyMessage,
  signerKeyFromSignature, tokenFromSignature, keyFromSignature,
} from "../src/wallet/sig-key.js";

const w = Wallet.createRandom();
const sig1 = await w.signTypedData(ARCA_KEY_DOMAIN, ARCA_KEY_TYPES, arcaKeyMessage());
const sig2 = await w.signTypedData(ARCA_KEY_DOMAIN, ARCA_KEY_TYPES, arcaKeyMessage());  // "re-connect"
console.log("signature deterministic (re-sign == first):", sig1 === sig2);

const sk1 = await signerKeyFromSignature(sig1);
const sk2 = await signerKeyFromSignature(sig2);
const addr1 = new Wallet(sk1).address, addr2 = new Wallet(sk2).address;
console.log("signer addr stable across re-sign:", addr1 === addr2, "->", addr1);

const t1 = await tokenFromSignature(sig1), t2 = await tokenFromSignature(sig2);
console.log("token stable across re-sign:", t1 === t2, "-> arca_live_" + t1.slice(0, 10) + "…");

const mk1 = Buffer.from(await keyFromSignature(sig1)).toString("hex");
const mk2 = Buffer.from(await keyFromSignature(sig2)).toString("hex");
console.log("memoryKey stable:", mk1 === mk2);
console.log("signer != memoryKey domain (distinct):", sk1.slice(2) !== mk1);

const pass = sig1 === sig2 && addr1 === addr2 && t1 === t2 && mk1 === mk2;
console.log(pass ? "\n✅ DETERMINISM PASS — reconnect reuses same signer+token+key" : "\n❌ FAIL");
process.exit(pass ? 0 : 1);
