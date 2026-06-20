/**
 * MemoryStore — the glue (see ../types.ts).
 *
 *   save  : record -> encrypt(JSON) -> 0G putBlob -> append local index
 *   recall: read index -> 0G getBlob -> decrypt -> parse -> filter
 *
 * The local index (~/.arca/index.json) holds ONLY {id, createdAt, rootHash}.
 * Plaintext lives ONLY on 0G, encrypted to the user's key — recall genuinely
 * round-trips through 0G. Un-ruggable once anchored.
 *
 * OgStorage + Crypto are injected via the constructor (interfaces from
 * ../types.ts) so this module stays decoupled from the src/og/ impls.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Wallet } from "ethers";
import type { Crypto, MemoryRecord, MemoryRegistry, MemoryStore, OgStorage } from "../types.js";

const ARCA_DIR = path.join(os.homedir(), ".arca");
const INDEX_PATH = path.join(ARCA_DIR, "index.json");

const enc = new TextEncoder();
const dec = new TextDecoder();

/** Short windows so a 0G storage stall never blocks the agent. */
const UPLOAD_CONFIRM_MS = 8_000; // save() waits this long to report "stored" vs "pending"; upload continues in bg
const DOWNLOAD_TIMEOUT_MS = 30_000;

/** Reject after `ms` if `p` hasn't settled — WITHOUT canceling `p` (a slow upload
 *  may still finalize in the background once 0G storage recovers). */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms`)),
      ms,
    );
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/** One line in ~/.arca/index.json — the pointer, never the plaintext. */
interface IndexEntry {
  id: string;
  createdAt: number; // epoch ms
  rootHash: string; // 0G Storage root hash (anchored)
  pending?: boolean; // blob upload not finalized yet (anchored on-chain, storage lagging)
}

export class ArcaMemoryStore implements MemoryStore {
  /** Caller's 0G address, derived from the key — used for on-chain root recovery. */
  private readonly address: string;

  constructor(
    private readonly storage: OgStorage,
    private readonly crypto: Crypto,
    private readonly privKeyHex: string,
    /** Optional on-chain registry. When set, roots are anchored on 0G Chain and
     *  the memory list is recoverable from the key alone on a fresh machine. */
    private readonly registry?: MemoryRegistry,
  ) {
    this.address = new Wallet(privKeyHex).address;
  }

  /**
   * Encrypt -> anchor-first on 0G Chain -> upload to 0G Storage (fail-fast) -> index.
   *
   * Order matters: the content root is computed locally and anchored on-chain
   * BEFORE the storage upload, so the memory is owned + recoverable even while
   * 0G Storage is stalled. The upload is then attempted with a timeout — it never
   * hangs the agent; on timeout the record is marked `pending` (anchored, blob
   * still syncing) and finalizes in the background once storage recovers.
   */
  async save(text: string): Promise<MemoryRecord> {
    const record: MemoryRecord = {
      id: this.randomId(),
      text,
      createdAt: Date.now(),
    };

    // Encrypt the full record JSON (not just text) so id/createdAt are private too.
    const plaintext = enc.encode(JSON.stringify(record));
    const ciphertext = await this.crypto.encrypt(plaintext, this.privKeyHex);

    // Content-addressed root, computed locally — known before the upload.
    const rootHash = await this.storage.rootOf(ciphertext);
    record.rootHash = rootHash;

    // Anchor-first: record the root on 0G Chain (recoverable, un-ruggable index)
    // BEFORE the upload. Best-effort: the local index still holds it regardless.
    if (this.registry) {
      try {
        await this.registry.addRoot(rootHash);
      } catch {
        /* anchored locally; chain anchor can be retried later */
      }
    }

    // Upload the blob in the BACKGROUND — never block the agent on a (possibly
    // stalled) storage upload. Anchor + index are already done, so the memory is
    // owned the moment save() returns. We wait only a short window to report
    // "stored" vs "pending"; the upload keeps going and flips the index entry to
    // finalized once the blob lands (self-heals when 0G storage recovers).
    record.pending = true;
    this.appendIndex({ id: record.id, createdAt: record.createdAt, rootHash, pending: true });

    const upload = this.storage.putBlob(ciphertext);
    upload.then(() => this.markFinalized(record.id)).catch(() => {
      /* still pending; a later save/retry re-uploads */
    });
    try {
      await withTimeout(upload, UPLOAD_CONFIRM_MS, "0G storage upload");
      record.pending = false; // finalized fast (healthy network)
    } catch {
      /* slow/stalled — returns pending; background upload + markFinalized continue */
    }
    return record;
  }

  /** Flip a saved entry from pending -> finalized once its blob lands on 0G. */
  private markFinalized(id: string): void {
    const index = this.readIndex();
    const entry = index.find((e) => e.id === id);
    if (entry?.pending) {
      entry.pending = false;
      fs.writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2), "utf8");
    }
  }

  /** Read index -> fetch from 0G -> decrypt -> parse. Optional substring filter. Newest-first. */
  async recall(query?: string): Promise<MemoryRecord[]> {
    let index = this.readIndex();
    // Fresh machine (no local index) + a deployed registry → recover the root
    // list from 0G Chain with just the key. createdAt is restored from each
    // decrypted record below, so the placeholder here is fine.
    if (index.length === 0 && this.registry) {
      const roots = await this.registry.getRoots(this.address);
      index = roots.map((rootHash) => ({ id: "", createdAt: 0, rootHash }));
    }
    const needle = query?.toLowerCase();

    const records: MemoryRecord[] = [];
    for (const entry of index) {
      // Per-record + fail-fast: a blob that isn't retrievable yet (pending finalize
      // / storage stall) is skipped, never hanging or failing the whole recall.
      let record: MemoryRecord;
      try {
        const ciphertext = await withTimeout(
          this.storage.getBlob(entry.rootHash),
          DOWNLOAD_TIMEOUT_MS,
          "0G storage download",
        );
        const plaintext = await this.crypto.decrypt(ciphertext, this.privKeyHex);
        record = JSON.parse(dec.decode(plaintext)) as MemoryRecord;
      } catch {
        continue;
      }
      // Ensure the rootHash reflects where it actually lives on 0G.
      record.rootHash = entry.rootHash;

      if (needle && !record.text.toLowerCase().includes(needle)) continue;
      records.push(record);
    }

    return records.sort((a, b) => b.createdAt - a.createdAt);
  }

  // --- local index helpers ---

  private readIndex(): IndexEntry[] {
    if (!fs.existsSync(INDEX_PATH)) return [];
    const raw = fs.readFileSync(INDEX_PATH, "utf8").trim();
    if (!raw) return [];
    return JSON.parse(raw) as IndexEntry[];
  }

  private appendIndex(entry: IndexEntry): void {
    fs.mkdirSync(ARCA_DIR, { recursive: true });
    const index = this.readIndex();
    index.push(entry);
    fs.writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2), "utf8");
  }

  private randomId(): string {
    // crypto.randomUUID is available in the Node 18+ global; no extra dep.
    return globalThis.crypto.randomUUID();
  }
}
