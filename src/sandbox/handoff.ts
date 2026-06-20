/**
 * Option-3 ECIES handoff — deliver a secret INTO the sealed enclave without the
 * operator/relay ever seeing it (ported from anima `migration/option3-crypto.ts`,
 * noble → ethers SigningKey so the SAME code runs in the browser dashboard and the
 * Node/bun container).
 *
 * Use in Arca: the sealed container generates a bootstrap keypair and exposes its
 * pubkey (+ TDX attestation). The dashboard ECIES-encrypts the user's EIP-712
 * signature to that pubkey and POSTs the envelope to /session; only inside the
 * enclave is it decrypted and the memory key derived. The relay sees ciphertext.
 *
 *   shared = ECDH(eph, recipient).x            (32-byte x-coordinate)
 *   aeadKey = HKDF-SHA256(shared, salt=ephPub, info="arca-sandbox-handoff-v1")
 *   AES-256-GCM(aeadKey, iv, plaintext)
 * Envelope: ephPub(compressed) | iv(12) | tag(16) | ct.
 *
 * SECURITY: in UNSEALED mode the dashboard can't verify the bootstrap pubkey →
 * a MITM could substitute its own and harvest the secret. SEALED mode closes this
 * by verifying the container's TDX attestation report before encrypting. (anima
 * ships unsealed today; sealing is the hardening — same posture here.)
 */
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { SigningKey, Wallet, getBytes, hexlify } from "ethers";

const HKDF_INFO = Buffer.from("arca-sandbox-handoff-v1", "utf8");

export interface HandoffEnvelope {
  ephPubkeyHex: string; // ephemeral compressed secp256k1 pubkey (33 bytes)
  ivHex: string;        // AES-GCM IV (12 bytes)
  tagHex: string;       // AES-GCM auth tag (16 bytes)
  ciphertextHex: string;
}

/** A fresh container bootstrap keypair (the enclave keeps the privkey, exposes the pubkey). */
export function generateBootstrapKeypair(): { privkeyHex: string; pubkeyHexCompressed: string } {
  const w = Wallet.createRandom();
  return { privkeyHex: w.privateKey, pubkeyHexCompressed: SigningKey.computePublicKey(w.privateKey, true) };
}

/** ECDH x-coordinate (32 bytes) — the shared secret material. */
function sharedX(privHex: string, pubHex: string): Buffer {
  const shared = new SigningKey(privHex).computeSharedSecret(pubHex); // 0x04 || x(32) || y(32)
  return Buffer.from(getBytes(shared).slice(1, 33));
}

/** Encrypt `plaintext` to the recipient's (container) compressed pubkey. */
export function encryptToPubkey(recipientPubkey: string, plaintext: Uint8Array): HandoffEnvelope {
  const eph = Wallet.createRandom();
  const ephPub = SigningKey.computePublicKey(eph.privateKey, true);
  const aeadKey = Buffer.from(hkdfSync("sha256", sharedX(eph.privateKey, recipientPubkey), Buffer.from(getBytes(ephPub)), HKDF_INFO, 32));
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", aeadKey, iv);
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { ephPubkeyHex: ephPub, ivHex: hexlify(iv), tagHex: hexlify(cipher.getAuthTag()), ciphertextHex: hexlify(ct) };
}

/** Decrypt an envelope with the recipient (container bootstrap) privkey. Inside the enclave. */
export function decryptWithPrivkey(recipientPrivkey: string, env: HandoffEnvelope): Uint8Array {
  const aeadKey = Buffer.from(hkdfSync("sha256", sharedX(recipientPrivkey, env.ephPubkeyHex), Buffer.from(getBytes(env.ephPubkeyHex)), HKDF_INFO, 32));
  const decipher = createDecipheriv("aes-256-gcm", aeadKey, getBytes(env.ivHex));
  decipher.setAuthTag(Buffer.from(getBytes(env.tagHex)));
  return new Uint8Array(Buffer.concat([decipher.update(Buffer.from(getBytes(env.ciphertextHex))), decipher.final()]));
}
