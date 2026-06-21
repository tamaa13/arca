/**
 * RemoteMemoryStore — the per-user store for the hosted (multi-tenant) MCP.
 *
 * Unlike ArcaMemoryStore (single local key + local index file), this store is:
 *   - keyed by the user's WALLET (owner) — roots are anchored UNDER the wallet via
 *     the v2 ArcaRegistry `addRootFor`, and recovered via `getRoots(wallet)`.
 *   - signed by a funded SESSION-SIGNER (delegate) — pays 0G gas + storage from the
 *     user's deposit, so the wallet never signs/pays per save.
 *   - encrypted with the WALLET-derived memory key (keyedCrypto) — operator can't read.
 *   - REGISTRY-ONLY for recall (no local index file) — stateless + correct across
 *     many users on one host, and cross-device by construction (the chain is the index).
 *
 * The three identities are deliberately separate: owner (wallet) ≠ gas signer
 * (delegate) ≠ encryption key (wallet signature). See [[reference_arca_design]].
 */
import type { Crypto, MemoryRecord, MemoryStore, OgStorage } from "../types.js";
import type { RegistryClient } from "../registry/client.js";

const enc = new TextEncoder();
const dec = new TextDecoder();

const UPLOAD_CONFIRM_MS = 8_000; // report stored vs pending; upload continues in bg
const DOWNLOAD_TIMEOUT_MS = 30_000;

/** Reject after `ms` without canceling `p` (a slow upload may still finalize). */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    p.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

export class RemoteMemoryStore implements MemoryStore {
  constructor(
    /** 0G Storage client — gas/fees paid by the session-signer. */
    private readonly storage: OgStorage,
    /** Encryption bound to the wallet-derived key (keyedCrypto). */
    private readonly crypto: Crypto,
    /** v2 registry client — signed by the session-signer (a registered delegate). */
    private readonly registry: RegistryClient,
    /** The user's WALLET address — roots are anchored under + recovered from it. */
    private readonly owner: string,
  ) {}

  /**
   * Encrypt (wallet key) → anchor under the wallet (delegate signs) → upload.
   *
   * `opts.blockUpload` waits for the storage upload to finalize and surfaces its
   * error (used by tests / sync callers). Default is the agent-facing behaviour:
   * a short confirm window, then return `pending` while the upload finalizes in
   * the background — so a stalled 0G storage never hangs the agent.
   */
  async save(text: string, opts?: { blockUpload?: boolean }): Promise<MemoryRecord> {
    const record: MemoryRecord = {
      id: globalThis.crypto.randomUUID(),
      text,
      createdAt: Date.now(),
    };

    const plaintext = enc.encode(JSON.stringify(record));
    const ciphertext = await this.crypto.encrypt(plaintext, ""); // keyedCrypto ignores the arg
    const rootHash = await this.storage.rootOf(ciphertext);
    record.rootHash = rootHash;

    // Anchor-first under the OWNER (wallet), signed by the delegate session-signer.
    // recall() is registry-only, so the anchor is what makes a save recoverable — a
    // failed anchor MUST surface (retry transient hiccups, then throw) instead of
    // silently orphaning an unrecoverable blob.
    await this.anchorWithRetry(rootHash);

    const upload = this.storage.putBlob(ciphertext);
    if (opts?.blockUpload) {
      await upload; // wait for finality; throw on a real upload error
      record.pending = false;
      return record;
    }

    // Background upload — never block the agent on a (possibly stalled) upload.
    record.pending = true;
    upload.catch(() => { /* stays pending; a later save/retry re-uploads */ });
    try {
      await withTimeout(upload, UPLOAD_CONFIRM_MS, "0G storage upload");
      record.pending = false;
    } catch {
      /* slow/stalled — returns pending; upload continues in the background */
    }
    return record;
  }

  /** Anchor with bounded retry; throw on persistent failure so a save never
   *  reports success without a recoverable on-chain root. */
  private async anchorWithRetry(rootHash: string, attempts = 3): Promise<void> {
    let lastErr: unknown;
    for (let i = 0; i < attempts; i++) {
      try {
        await this.registry.addRootFor(this.owner, rootHash);
        return;
      } catch (err) {
        lastErr = err;
        if (i < attempts - 1) await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
      }
    }
    throw new Error(`anchor failed after ${attempts} attempts: ${(lastErr as Error)?.message ?? String(lastErr)}`);
  }

  /** Registry-only recall: getRoots(wallet) → getBlob → decrypt. Newest-first. */
  async recall(query?: string): Promise<MemoryRecord[]> {
    const roots = await this.registry.getRoots(this.owner);
    const needle = query?.toLowerCase();
    const seen = new Set<string>();

    const records: MemoryRecord[] = [];
    for (const rootHash of roots) {
      if (seen.has(rootHash)) continue; // registry is append-only — dedup
      seen.add(rootHash);
      try {
        const ciphertext = await withTimeout(
          this.storage.getBlob(rootHash),
          DOWNLOAD_TIMEOUT_MS,
          "0G storage download",
        );
        const plaintext = await this.crypto.decrypt(ciphertext, "");
        const record = JSON.parse(dec.decode(plaintext)) as MemoryRecord;
        record.rootHash = rootHash;
        if (needle && !record.text.toLowerCase().includes(needle)) continue;
        records.push(record);
      } catch {
        continue; // not finalized yet / not ours → skip, never hang the whole recall
      }
    }
    return records.sort((a, b) => b.createdAt - a.createdAt);
  }
}
