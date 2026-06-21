// Option-3 ECIES — encrypt the signature to the enclave bootstrap pubkey, browser-side
// (Web Crypto). Matches src/sandbox/handoff.ts (node) so a sealed container decrypts it:
//   shared = ECDH(eph, recipient).x
//   aeadKey = HKDF-SHA256(shared, salt=ephPub, info="arca-sandbox-handoff-v1")
//   AES-256-GCM(aeadKey, iv, plaintext)
// Ported EXACTLY from the legacy dashboard's encryptToPubkey.
import { SigningKey, Wallet, getBytes, hexlify } from "ethers";
import type { HandoffEnvelope } from "./types";

// Web Crypto's BufferSource typing (TS 5.9 + lib.dom) is strict about ArrayBufferLike;
// ethers' getBytes returns a plain ArrayBuffer-backed Uint8Array at runtime, so this
// cast is safe and keeps the byte layout identical to the node handoff.
const buf = (u: Uint8Array): BufferSource => u as unknown as BufferSource;

export async function encryptToPubkey(
  recipientPubkey: string,
  plaintext: Uint8Array,
): Promise<HandoffEnvelope> {
  const eph = Wallet.createRandom();
  const ephPub = SigningKey.computePublicKey(eph.privateKey, true);
  const x = getBytes(new SigningKey(eph.privateKey).computeSharedSecret(recipientPubkey)).slice(1, 33);
  const base = await crypto.subtle.importKey("raw", buf(x), "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: buf(getBytes(ephPub)),
      info: buf(new TextEncoder().encode("arca-sandbox-handoff-v1")),
    },
    base,
    256,
  );
  const key = await crypto.subtle.importKey("raw", bits, "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ctTag = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: buf(iv) }, key, buf(plaintext)),
  );
  return {
    ephPubkeyHex: ephPub,
    ivHex: hexlify(iv),
    tagHex: hexlify(ctTag.slice(ctTag.length - 16)),
    ciphertextHex: hexlify(ctTag.slice(0, ctTag.length - 16)),
  };
}
