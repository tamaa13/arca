/**
 * SHARED CONTRACTS — every module builds against these interfaces.
 * Do NOT change a signature without PM sign-off (other agents depend on it).
 */

/** One memory item. */
export interface MemoryRecord {
  id: string;
  text: string;
  createdAt: number; // epoch ms
  /** 0G Storage root hash once anchored. undefined = still local/pending (NOT un-ruggable yet). */
  rootHash?: string;
  /** true = root anchored on-chain + indexed, but the 0G Storage blob upload hasn't
   *  finalized yet (e.g. storage network stall). Recall surfaces it once retrievable. */
  pending?: boolean;
}

/** 0G Storage layer — implemented in src/og/storage.ts */
export interface OgStorage {
  /** Compute the content-addressed 0G root locally (NO upload), so the caller can
   *  anchor it on-chain before — or independently of — the (possibly stalled) upload. */
  rootOf(bytes: Uint8Array): Promise<string>;
  /** Upload bytes to 0G Storage (mainnet 16661). Returns the 0G root hash. */
  putBlob(bytes: Uint8Array): Promise<string>;
  /** Retrieve bytes from 0G Storage by root hash. */
  getBlob(rootHash: string): Promise<Uint8Array>;
}

/** Client-side encryption — implemented in src/og/crypto.ts */
export interface Crypto {
  /** Encrypt plaintext to the user's key (AES-256-GCM; key = SHA-256(privKey)). */
  encrypt(plaintext: Uint8Array, privKeyHex: string): Promise<Uint8Array> | Uint8Array;
  /** Decrypt ciphertext with the user's key. */
  decrypt(ciphertext: Uint8Array, privKeyHex: string): Promise<Uint8Array> | Uint8Array;
}

/** Local key management — implemented in src/memory/key.ts */
export interface KeyManager {
  /** Load existing key from ~/.arca/key, or generate a fresh secp256k1 key. */
  loadOrCreate(): { privKeyHex: string; address: string };
  /** Return the private key hex for the user to back up. */
  exportKey(): string;
}

/** The memory store (the glue) — implemented in src/memory/store.ts */
export interface MemoryStore {
  /** Encrypt -> upload to 0G -> index. Returns the record (rootHash set once anchored). */
  save(text: string): Promise<MemoryRecord>;
  /** Read index -> fetch from 0G -> decrypt. Optional naive substring filter on `query`. */
  recall(query?: string): Promise<MemoryRecord[]>;
}

/** On-chain memory registry — contract in contracts/ArcaRegistry.sol, TS client in src/registry/client.ts.
 *  Anchors each memory's 0G root hash on 0G CHAIN per user, so the memory list is recoverable
 *  from the key alone (any machine) — the index itself becomes un-ruggable. */
export interface MemoryRegistry {
  /** Anchor a memory root on 0G Chain for the caller (signs a tx). */
  addRoot(rootHash: string): Promise<void>;
  /** Recover all anchored memory roots for a user (view call). */
  getRoots(user: string): Promise<string[]>;
}

/** 0G config — defaults to mainnet (Aristotle 16661); env overrides allow a
 *  testnet (Galileo 16602) run without code changes:
 *    ARCA_RPC=https://evmrpc-testnet.0g.ai
 *    ARCA_INDEXER=https://indexer-storage-testnet-turbo.0g.ai
 *    ARCA_CHAIN_ID=16602
 *  (Flow contract is resolved per-network by the indexer/nodes, so no override needed.) */
export const OG = {
  chainId: Number(process.env.ARCA_CHAIN_ID ?? 16661),
  rpc: process.env.ARCA_RPC ?? "https://evmrpc.0g.ai",
  indexer: process.env.ARCA_INDEXER ?? "https://indexer-storage-turbo.0g.ai",
  flowContract: "0x62D4144dB0F0a6fBBaeb6296c785C71B3D57C526",
  /** ArcaRegistry — defaults to the v2 owner-mapping MAINNET deployment (0xbf97…) so a
   *  published v2 install works out of the box; env ARCA_REGISTRY_ADDR overrides (deploy
   *  envs set testnet v2 0xc196…). The v1 self-anchor registry was 0x746C…. */
  registry:
    process.env.ARCA_REGISTRY_ADDR ??
    "0xbf9751705b347fe21A5171Ebf2b0d00e1D91a540",
} as const;
