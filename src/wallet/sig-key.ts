/**
 * Wallet-signature-derived memory key (Phase 1b).
 *
 * The user never manages a key file. They connect their own wallet and sign ONE
 * structured EIP-712 message; the AES-256-GCM key is HKDF-derived from that
 * signature — never from the wallet private key (which the wallet never exposes).
 *
 * This mirrors anima's proven model
 * (`packages/core/src/wallet/operator-keystore-crypto.ts`):
 *   - Sign-derived (not ECIES): works for any wallet that signs EIP-712.
 *   - Deterministic: ECDSA under RFC-6979 → same (wallet, message) → same key,
 *     so the SAME key regenerates on any device → cross-device for free.
 *   - EIP-712 typed data (not opaque hex): the wallet shows a structured "Arca"
 *     message, so a phishing site can't trick the user into signing it as a login.
 *
 * Blob layout matches og/crypto: `iv(12) | ciphertext+tag` (AES-256-GCM).
 */
import { webcrypto } from "node:crypto";
import type { Crypto as CryptoContract } from "../types.js";

const subtle = webcrypto.subtle;
const IV_BYTES = 12;
const HKDF_INFO = new TextEncoder().encode("arca-memory-aead-v1");
const asBuf = (u: Uint8Array): webcrypto.BufferSource =>
  u as unknown as webcrypto.BufferSource;

/** EIP-712 the wallet signs to derive its memory key (structured = phishing-safe). */
export const ARCA_KEY_DOMAIN = { name: "Arca", version: "1" } as const;
export const ARCA_KEY_TYPES = {
  ArcaKey: [
    { name: "purpose", type: "string" },
    { name: "scope", type: "string" },
  ],
} as const;
export const arcaKeyMessage = (scope = "memory-v1") => ({
  purpose: "Derive your Arca memory encryption key.",
  scope,
});

/** Minimal signer surface — satisfied by ethers Wallet AND a browser wallet bridge. */
export interface TypedDataSigner {
  signTypedData(
    domain: typeof ARCA_KEY_DOMAIN,
    types: typeof ARCA_KEY_TYPES,
    message: ReturnType<typeof arcaKeyMessage>,
  ): Promise<string>;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0 || /[^0-9a-fA-F]/.test(clean)) {
    throw new Error("sig-key: invalid signature hex");
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/** HKDF-SHA256(signature) -> 32-byte AES key. */
export async function keyFromSignature(sigHex: string): Promise<Uint8Array> {
  const ikm = hexToBytes(sigHex);
  const base = await subtle.importKey("raw", asBuf(ikm), "HKDF", false, ["deriveBits"]);
  const bits = await subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: HKDF_INFO },
    base,
    256,
  );
  return new Uint8Array(bits);
}

/** Ask the wallet to sign the Arca EIP-712 message, derive the AES key from it. */
export async function deriveMemoryKey(
  signer: TypedDataSigner,
  scope = "memory-v1",
): Promise<Uint8Array> {
  const sig = await signer.signTypedData(
    ARCA_KEY_DOMAIN,
    ARCA_KEY_TYPES,
    arcaKeyMessage(scope),
  );
  return keyFromSignature(sig);
}

/**
 * A `Crypto` impl bound to a raw 32-byte key (the wallet-derived key). Same
 * AES-256-GCM + `iv|ct+tag` layout as og/crypto, so the memory store can use it
 * transparently. The `privKeyHex` argument of the Crypto contract is ignored —
 * the key is captured here.
 */
export function keyedCrypto(key: Uint8Array): CryptoContract {
  if (key.byteLength !== 32) throw new Error("keyedCrypto: key must be 32 bytes");
  const cryptoKey = (usage: "encrypt" | "decrypt") =>
    subtle.importKey("raw", asBuf(key), "AES-GCM", false, [usage]);

  return {
    async encrypt(plaintext: Uint8Array): Promise<Uint8Array> {
      const k = await cryptoKey("encrypt");
      const iv = webcrypto.getRandomValues(new Uint8Array(IV_BYTES));
      const ct = new Uint8Array(
        await subtle.encrypt({ name: "AES-GCM", iv: asBuf(iv) }, k, asBuf(plaintext)),
      );
      const out = new Uint8Array(iv.byteLength + ct.byteLength);
      out.set(iv, 0);
      out.set(ct, iv.byteLength);
      return out;
    },
    async decrypt(ciphertext: Uint8Array): Promise<Uint8Array> {
      if (ciphertext.byteLength <= IV_BYTES) throw new Error("keyedCrypto: ciphertext too short");
      const k = await cryptoKey("decrypt");
      const iv = ciphertext.subarray(0, IV_BYTES);
      const ct = ciphertext.subarray(IV_BYTES);
      return new Uint8Array(
        await subtle.decrypt({ name: "AES-GCM", iv: asBuf(iv) }, k, asBuf(ct)),
      );
    },
  };
}
