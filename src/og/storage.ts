/**
 * 0G Storage layer — mainnet (Aristotle, chainId 16661).
 *
 * Implements the `OgStorage` contract from ../types.js:
 *   putBlob(bytes)  -> rootHash   (uploads to 0G Storage, anchors on the Flow contract)
 *   getBlob(rootHash) -> bytes    (retrieves by content root hash)
 *
 * Ported from Yap's proven mainnet code
 * (apps/web/lib/0g/storage.ts) — same Indexer + MemData + resilient-receipt
 * pattern, adapted to the renamed `@0gfoundation/0g-storage-ts-sdk` (v1.2.10).
 *
 * The constructor signer funds the storage gas and signs the Flow `submit()`
 * the Indexer issues on upload. Memory blobs are tiny, so a couple of 0G covers
 * many flushes.
 */

import { Indexer, MemData } from "@0gfoundation/0g-storage-ts-sdk";
import { JsonRpcProvider, Wallet } from "ethers";
import { OG, type OgStorage } from "../types.js";

/**
 * Upload options for 0G Storage.
 *
 * `skipTx: true` makes upload idempotent — if the rootHash already exists on
 * the storage network (e.g. from a prior retry or an identical blob), skip the
 * on-chain submit tx (which the Flow contract rejects as a duplicate) and just
 * re-seed the chunks. `finalityRequired: true` waits for the data to be sealed
 * so a subsequent getBlob is guaranteed to find it.
 */
const UPLOAD_OPTS = {
  tags: "0x",
  finalityRequired: true,
  taskSize: 10,
  expectedReplica: 1,
  skipTx: true,
  fee: BigInt(0),
} as const;

export class OgStorageClient implements OgStorage {
  private readonly signer: Wallet;
  private readonly indexer: Indexer;

  /**
   * @param privKeyHex secp256k1 private key (with or without 0x prefix) that
   *   funds the storage gas and signs Flow submissions on 0G mainnet.
   */
  constructor(privKeyHex: string) {
    const pk = privKeyHex.startsWith("0x") ? privKeyHex : `0x${privKeyHex}`;
    const provider = new JsonRpcProvider(OG.rpc);
    this.signer = new Wallet(pk, provider);
    this.indexer = new Indexer(OG.indexer);
  }

  /** Address of the funding/signing wallet (handy for "fund this" prompts). */
  get address(): string {
    return this.signer.address;
  }

  /**
   * Compute the content-addressed 0G root locally (merkle, no network). Lets the
   * caller anchor the root on-chain BEFORE / independently of the storage upload,
   * so a storage stall can't block ownership.
   */
  async rootOf(bytes: Uint8Array): Promise<string> {
    const [tree, err] = await new MemData(bytes).merkleTree();
    if (err !== null || tree === null) {
      throw err ?? new Error("rootOf: merkleTree() failed");
    }
    const rootHash = tree.rootHash();
    if (!rootHash) throw new Error("rootOf: empty root hash");
    return rootHash;
  }

  /**
   * Upload bytes to 0G Storage. Returns the content root hash.
   *
   * The root hash is derived locally from the merkle tree (content-addressed),
   * so it is known before — and independent of — the on-chain submission. We
   * return it even when `skipTx` short-circuits the tx, which keeps re-uploads
   * of identical bytes idempotent.
   */
  async putBlob(bytes: Uint8Array): Promise<string> {
    if (bytes.byteLength === 0) {
      throw new Error("putBlob: refusing to upload empty blob");
    }

    // Pass the Uint8Array directly. MemData stores `data` as-is (ArrayLike).
    const mem = new MemData(bytes);

    // Compute the content root locally — this is the address we return.
    const [tree, treeErr] = await mem.merkleTree();
    if (treeErr !== null || tree === null) {
      throw treeErr ?? new Error("putBlob: merkleTree() failed");
    }
    const rootHash = tree.rootHash();
    if (!rootHash) throw new Error("putBlob: empty root hash");

    // upload(file, rpc, signer, uploadOpts?, retryOpts?, opts?)
    //   -> [ { txHash, rootHash, txSeq } | { txHashes, rootHashes, txSeqs }, Error|null ]
    // The signer type is bound to the SDK's bundled ethers; our Wallet is the
    // app's ethers. Runtime is identical — cast at the boundary.
    //
    // The indexer pool can hand back a node from the WRONG network (e.g. a mainnet
    // node from the testnet-turbo pool), and `flow.market()` then reverts on the
    // configured RPC (BAD_DATA). Node selection is re-rolled per attempt, so a
    // bounded retry almost always lands on a matching node. skipIfFinalized makes
    // re-tries idempotent if an earlier attempt already seeded the blob.
    const ATTEMPTS = 5;
    let lastErr: Error | null = null;
    for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
      const [, uploadErr] = await this.indexer.upload(
        mem,
        OG.rpc,
        this.signer as unknown as Parameters<typeof this.indexer.upload>[2],
        UPLOAD_OPTS as unknown as Parameters<typeof this.indexer.upload>[3],
      );
      if (uploadErr === null) return rootHash;
      lastErr = uploadErr;
      if (attempt < ATTEMPTS) await new Promise((r) => setTimeout(r, 700 * attempt));
    }
    throw lastErr ?? new Error("putBlob: upload failed after retries");
  }

  /**
   * Retrieve bytes from 0G Storage by content root hash.
   *
   * Uses `downloadToBlob` (browser- and Node-safe, no temp files) and returns
   * the raw bytes. The caller (MemoryStore) decrypts.
   */
  async getBlob(rootHash: string): Promise<Uint8Array> {
    const [blob, err] = await this.indexer.downloadToBlob(rootHash);
    if (err !== null || !blob) {
      throw err ?? new Error(`getBlob: download failed for ${rootHash}`);
    }
    const buf = await blob.arrayBuffer();
    return new Uint8Array(buf);
  }
}

export default OgStorageClient;
