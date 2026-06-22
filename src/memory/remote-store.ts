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
const RECALL_CONCURRENCY = 10; // parallel blob downloads per recall (bounds load on 0G)
const DEFAULT_RECALL_LIMIT = 50; // newest-first cap so recall stays bounded on large vaults

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
    const msg = (lastErr as Error)?.message ?? String(lastErr);
    if (/insufficient funds|INSUFFICIENT_FUNDS/i.test(msg)) {
      throw new Error(
        "Arca storage deposit empty — the session signer is out of gas. Top up a little 0G " +
          "in the Arca dashboard to keep saving. Your existing memories are safe and recallable.",
      );
    }
    throw new Error(`anchor failed after ${attempts} attempts: ${msg}`);
  }

  /** Per-session cache: rootHash → decrypted record. Roots are immutable (content-addressed),
   *  so a cached entry never goes stale; a recall only downloads roots it hasn't seen yet. The
   *  store is created per MCP session, so the cache is scoped to one wallet + already-in-RAM key. */
  private readonly cache = new Map<string, MemoryRecord>();

  /**
   * Registry-only recall: getRoots(wallet) → getBlob → decrypt → filter → newest-first, capped.
   *
   * BOUNDED: returns at most `limit` (default 50) newest memories. The common no-query path slices
   * the newest `limit` roots BEFORE downloading (relies on getRoots' append-only insertion order),
   * so it's O(limit) downloads, not O(whole vault). A query must scan every root (no server-side
   * index) but the result is still capped after the newest-first sort.
   *
   * PARALLEL + CACHED: downloads run bounded-concurrent and ONLY for roots not already cached, so
   * repeat/incremental recalls within a session are near-instant. A not-yet-finalized / foreign blob
   * is skipped (absent from the cache) and naturally retried next recall.
   *
   * MATCHING: `query` is tokenized (whitespace/punctuation-insensitive, order-independent) — a record
   * matches iff every query term is a substring of some record token. So "E2E secret" matches
   * "E2E-485D-SECRET". (Server-side pagination for truly huge vaults is still tracked separately.)
   */
  async recall(query?: string, limit = DEFAULT_RECALL_LIMIT): Promise<MemoryRecord[]> {
    const roots = await this.registry.getRoots(this.owner);
    const unique = [...new Set(roots)]; // append-only registry → dedup, INSERTION order (oldest→newest)

    const candidates = query ? unique : unique.slice(-limit); // no-query: only newest `limit` need downloading
    const missing = candidates.filter((h) => !this.cache.has(h));

    await mapLimited(missing, RECALL_CONCURRENCY, async (rootHash) => {
      try {
        const ciphertext = await withTimeout(this.storage.getBlob(rootHash), DOWNLOAD_TIMEOUT_MS, "0G storage download");
        const plaintext = await this.crypto.decrypt(ciphertext, "");
        const record = JSON.parse(dec.decode(plaintext)) as MemoryRecord;
        record.rootHash = rootHash;
        this.cache.set(rootHash, record);
      } catch {
        /* not finalized yet / not ours → skip; retried on the next recall (stays uncached) */
      }
    });

    const terms = query ? tokenize(query) : null;
    const records: MemoryRecord[] = [];
    for (const rootHash of candidates) {
      const record = this.cache.get(rootHash);
      if (!record) continue;
      if (terms && terms.length > 0 && !matchesAllTerms(record.text, terms)) continue;
      records.push(record);
    }
    return records.sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
  }
}

/** Lowercase + split on non-alphanumeric runs → tokens. "E2E-485D-SECRET" → [e2e, 485d, secret]. */
function tokenize(s: string): string[] {
  return s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

/** Match iff EVERY query term is a substring of SOME record token — whitespace/punctuation-
 *  insensitive + order-independent (so "E2E secret" matches "E2E-485D-SECRET"). */
function matchesAllTerms(text: string, terms: string[]): boolean {
  const toks = tokenize(text);
  return terms.every((t) => toks.some((tok) => tok.includes(t)));
}

/** Run `fn` over `items` with at most `limit` in flight. Never rejects (fn handles its own
 *  errors); resolves when all are done. Keeps recall from opening unbounded 0G connections. */
async function mapLimited<T>(items: T[], limit: number, fn: (x: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const i = next++;
      await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}
