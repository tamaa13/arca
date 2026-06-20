/**
 * Client-side encryption — the user's private key IS the encryption key.
 *
 * Implements the `Crypto` contract from ../types.js:
 *   encrypt(plaintext, privKeyHex) -> ciphertext
 *   decrypt(ciphertext, privKeyHex) -> plaintext
 *
 * Design (mirrors Yap's apps/web/lib/0g/encrypt.ts AES-256-GCM scheme, but
 * keyed off the user's key instead of a random per-blob key):
 *   - Derive a deterministic 32-byte AES-256-GCM key = SHA-256(privKey bytes).
 *     SHA-256 over the secp256k1 secret is a one-way KDF; the privKey never
 *     leaves the client and is never stored in the blob.
 *   - Per-encrypt random 12-byte IV (GCM nonce).
 *   - Output blob layout: `iv (12) | ciphertext+tag` — a single buffer that
 *     goes straight to 0G Storage. The 16-byte GCM auth tag is appended to the
 *     ciphertext by WebCrypto, giving us integrity for free.
 *
 * Uses only Node's built-in `crypto.subtle` (globalThis.crypto) — no extra
 * deps, so none of the eciesjs ESM-interop pain. AES-256-GCM with a key bound
 * to the user's secret means even the storage operator can't read the memory.
 */

import { webcrypto } from "node:crypto";
import { type Crypto as CryptoContract } from "../types.js";

// Web Crypto runtime (Node's built-in). `globalThis.crypto` also works at
// runtime, but importing the `webcrypto` object keeps the DOM-lib-free
// tsconfig ("lib": ["ES2022"], no DOM) happy — its types come from @types/node.
const subtle = webcrypto.subtle;

const IV_BYTES = 12;

/** Strip an optional 0x prefix and decode hex -> bytes. */
function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0 || /[^0-9a-fA-F]/.test(clean)) {
    throw new Error("crypto: invalid private-key hex");
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

// Cast Uint8Array -> webcrypto.BufferSource at the call boundary; runtime is
// identical (a Uint8Array IS an ArrayBufferView).
const asBuf = (u: Uint8Array): webcrypto.BufferSource =>
  u as unknown as webcrypto.BufferSource;

/** Derive a deterministic AES-256-GCM CryptoKey from the user's private key. */
async function deriveAesKey(
  privKeyHex: string,
  usage: "encrypt" | "decrypt",
): Promise<webcrypto.CryptoKey> {
  const keyMaterial = hexToBytes(privKeyHex);
  const digest = await subtle.digest("SHA-256", asBuf(keyMaterial));
  return subtle.importKey("raw", digest, "AES-GCM", false, [usage]);
}

class OgCrypto implements CryptoContract {
  /** Encrypt plaintext to the user's key. Returns `iv | ciphertext+tag`. */
  async encrypt(plaintext: Uint8Array, privKeyHex: string): Promise<Uint8Array> {
    const key = await deriveAesKey(privKeyHex, "encrypt");
    const iv = webcrypto.getRandomValues(new Uint8Array(IV_BYTES));
    const ctBuf = await subtle.encrypt(
      { name: "AES-GCM", iv: asBuf(iv) },
      key,
      asBuf(plaintext),
    );
    const ct = new Uint8Array(ctBuf);
    const out = new Uint8Array(iv.byteLength + ct.byteLength);
    out.set(iv, 0);
    out.set(ct, iv.byteLength);
    return out;
  }

  /** Decrypt `iv | ciphertext+tag` with the user's key. */
  async decrypt(ciphertext: Uint8Array, privKeyHex: string): Promise<Uint8Array> {
    if (ciphertext.byteLength <= IV_BYTES) {
      throw new Error("crypto: ciphertext too short");
    }
    const key = await deriveAesKey(privKeyHex, "decrypt");
    const iv = ciphertext.subarray(0, IV_BYTES);
    const ct = ciphertext.subarray(IV_BYTES);
    const ptBuf = await subtle.decrypt(
      { name: "AES-GCM", iv: asBuf(iv) },
      key,
      asBuf(ct),
    );
    return new Uint8Array(ptBuf);
  }
}

/** Singleton instance implementing the `Crypto` contract. */
export const ogCrypto: CryptoContract = new OgCrypto();

export { OgCrypto };
export default ogCrypto;
