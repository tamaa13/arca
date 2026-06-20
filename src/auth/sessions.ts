/**
 * Per-user sessions for the hosted MCP (lean / pre-OAuth, pre-TEE).
 *
 * Flow: the dashboard has the user connect their wallet and sign the Arca EIP-712
 * message (off-chain, no gas). It POSTs {wallet, signature} here. We:
 *   1. verify the signature actually recovers to `wallet` (proves ownership),
 *   2. HKDF-derive the memory key from that signature (never leaves the server in
 *      this lean build — the TEE milestone 1c moves this into an enclave),
 *   3. mint (or reuse) a per-wallet SESSION-SIGNER that pays 0G gas from the
 *      user's deposit, registered on-chain as a registry delegate,
 *   4. issue a bearer token the agent sends on every MCP request.
 *
 * Storage is in-memory: a restart drops sessions (the user re-connects in the
 * dashboard). A durable store + real OAuth + an enclave-held key are later phases —
 * this is the functional, testnet-first version. NOT operator-blind yet (no TEE).
 */
import { randomBytes } from "node:crypto";
import { verifyTypedData, Wallet } from "ethers";
import {
  ARCA_KEY_DOMAIN,
  ARCA_KEY_TYPES,
  arcaKeyMessage,
  keyFromSignature,
} from "../wallet/sig-key.js";

export interface UserSession {
  /** The user's wallet address — the memory owner (roots keyed here). */
  wallet: string;
  /** AES-256 memory key, HKDF-derived from the wallet's EIP-712 signature. */
  memoryKey: Uint8Array;
  /** Funded session-signer private key — pays 0G gas/fees from the deposit. */
  signerKey: string;
  /** The session-signer's address (the user funds + delegates to this). */
  signerAddress: string;
  /** Bearer token the agent presents on every MCP request. */
  token: string;
}

const byToken = new Map<string, UserSession>();
const byWallet = new Map<string, UserSession>();

/**
 * Verify ownership + (re)issue a session for `wallet`. Re-connecting the same
 * wallet refreshes the key but keeps the same session-signer + token (so a funded,
 * already-delegated signer is reused — no orphaned deposits).
 */
export async function createSession(wallet: string, signatureHex: string): Promise<UserSession> {
  // verifyTypedData wants mutable domain/types; ARCA_* are `as const` (readonly) → clone.
  const recovered = verifyTypedData(
    { name: ARCA_KEY_DOMAIN.name, version: ARCA_KEY_DOMAIN.version },
    { ArcaKey: ARCA_KEY_TYPES.ArcaKey.map((f) => ({ name: f.name, type: f.type })) },
    arcaKeyMessage(),
    signatureHex,
  );
  if (recovered.toLowerCase() !== wallet.toLowerCase()) {
    throw new Error("signature does not match wallet");
  }

  const memoryKey = await keyFromSignature(signatureHex);
  const key = wallet.toLowerCase();

  const existing = byWallet.get(key);
  if (existing) {
    existing.memoryKey = memoryKey; // same signer + token, refreshed key
    return existing;
  }

  const signer = Wallet.createRandom();
  const session: UserSession = {
    wallet,
    memoryKey,
    signerKey: signer.privateKey,
    signerAddress: signer.address,
    token: `arca_live_${randomBytes(18).toString("hex")}`,
  };
  byToken.set(session.token, session);
  byWallet.set(key, session);
  return session;
}

/** Resolve a bearer token to its session, or undefined. */
export function sessionForToken(token: string): UserSession | undefined {
  return byToken.get(token);
}

/** Look up a wallet's existing session (e.g. to show its signer/deposit address). */
export function sessionForWallet(wallet: string): UserSession | undefined {
  return byWallet.get(wallet.toLowerCase());
}
