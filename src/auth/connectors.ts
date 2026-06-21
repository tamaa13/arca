/**
 * Per-connector access tokens — granular, individually-revocable agent credentials.
 *
 * Replaces the single shared deterministic bearer: each agent connection (CLI device
 * or web/OAuth client) gets its OWN opaque random token, so one can be revoked without
 * touching the others. The token maps to a WALLET (the vault owner); the memory key is
 * still derived from the wallet signature and held only in the in-memory session — NEVER
 * on disk. We persist ONLY non-replayable metadata: sha256(token) → {wallet,label,…}.
 *
 * Mint/revoke are authorized by a wallet signature over a DOMAIN-SEPARATED, human-readable
 * (EIP-191) message — disjoint from the EIP-712 key-deriving message, so the management
 * signature never reveals the memory key. (Pattern ported from anima gateway auth.)
 *
 * Honest scope: this gives per-connector REVOKE + a unified list. It does NOT make a
 * headless CLI survive a cold server restart with zero human action — the memory key is
 * RAM-only (operator-blind), so a restart needs ONE wallet re-sign to re-establish the
 * key; the persisted connector rows then re-bind automatically. (TEE milestone closes
 * the zero-touch gap.)
 */
import { createHash, randomBytes } from "node:crypto";
import { chmodSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { getAddress, verifyMessage } from "ethers";

const FILE = process.env.ARCA_CONNECTORS_FILE; // persist path; unset = in-memory only
const DEFAULT_TTL_S = 90 * 24 * 60 * 60; // 90 days (Tailscale-style); 0 = never
const MGMT_FRESH_MS = 5 * 60 * 1000; // management-sig freshness window
const MGMT_FUTURE_MS = 60 * 1000;

export type ConnectorKind = "cli" | "oauth";

export interface ConnectorRow {
  /** sha256(rawToken) — the lookup key. The raw token is NEVER stored. */
  hash: string;
  /** Owner wallet (lowercased) — the vault this connector reads/writes. */
  wallet: string;
  /** Human label shown in the dashboard ("Codex-laptop"). */
  label: string;
  kind: ConnectorKind;
  /** OAuth rows: the client_id + token family (so revoke can kill the family). */
  clientId?: string;
  family?: string;
  createdAt: number; // unix s
  expiresAt: number; // unix s; 0 = never
  revoked: boolean;
}

/** Safe public view (no hash leak beyond an opaque id). */
export interface ConnectorListing {
  id: string; // == hash (opaque; safe to show — it is sha256, not the token)
  label: string;
  kind: ConnectorKind;
  createdAt: number;
  expiresAt: number;
  revoked: boolean;
}

const byHash = new Map<string, ConnectorRow>();
const byWallet = new Map<string, Set<string>>(); // wallet → Set<hash>
const consumedMgmtSigs = new Set<string>(); // replay defense (sha256 of the signature)

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const nowS = () => Math.floor(Date.now() / 1000);

function index(row: ConnectorRow): void {
  byHash.set(row.hash, row);
  let set = byWallet.get(row.wallet);
  if (!set) { set = new Set(); byWallet.set(row.wallet, set); }
  set.add(row.hash);
}

function persist(): void {
  if (!FILE) return;
  try {
    const tmp = `${FILE}.tmp`;
    writeFileSync(tmp, JSON.stringify([...byHash.values()]), "utf8");
    try { chmodSync(tmp, 0o600); } catch { /* best-effort perms */ }
    renameSync(tmp, FILE); // atomic
  } catch (err) {
    console.error("[connectors] persist failed:", (err as Error).message);
  }
}

/** Load persisted rows at startup (call once before listen). */
export function loadConnectors(): void {
  if (!FILE) return;
  try {
    const arr = JSON.parse(readFileSync(FILE, "utf8")) as ConnectorRow[];
    const t = nowS();
    for (const r of arr) {
      if (!r?.hash || !r?.wallet) continue;
      if (r.expiresAt !== 0 && r.expiresAt < t) continue; // drop expired
      index(r);
    }
    console.error(`[connectors] loaded ${byHash.size} connector(s)`);
  } catch { /* no file yet */ }
}

/** Mint a new connector token. Returns the RAW token ONCE (never recoverable after). */
export function mintConnector(opts: {
  wallet: string;
  label: string;
  kind: ConnectorKind;
  clientId?: string;
  family?: string;
  ttlS?: number; // 0 = never; default 90d
}): { token: string; row: ConnectorRow } {
  const token = `arca_live_${randomBytes(18).toString("base64url")}`;
  const t = nowS();
  const ttl = opts.ttlS ?? DEFAULT_TTL_S;
  const row: ConnectorRow = {
    hash: sha(token),
    wallet: opts.wallet.toLowerCase(),
    label: opts.label.slice(0, 64),
    kind: opts.kind,
    clientId: opts.clientId,
    family: opts.family,
    createdAt: t,
    expiresAt: ttl === 0 ? 0 : t + ttl,
    revoked: false,
  };
  index(row);
  persist();
  return { token, row };
}

/** Resolve a raw bearer to its row (valid, not revoked, not expired) or null. */
export function resolveConnector(rawToken: string): ConnectorRow | null {
  const row = byHash.get(sha(rawToken));
  if (!row || row.revoked) return null;
  if (row.expiresAt !== 0 && nowS() > row.expiresAt) return null;
  return row;
}

/** List a wallet's connectors (no secrets). */
export function listConnectors(wallet: string): ConnectorListing[] {
  const set = byWallet.get(wallet.toLowerCase());
  if (!set) return [];
  const out: ConnectorListing[] = [];
  for (const h of set) {
    const r = byHash.get(h);
    if (r) out.push({ id: r.hash, label: r.label, kind: r.kind, createdAt: r.createdAt, expiresAt: r.expiresAt, revoked: r.revoked });
  }
  return out.sort((a, b) => b.createdAt - a.createdAt);
}

/** Revoke one connector (by id == hash) owned by `wallet`. Returns the row (so the
 *  caller can revoke an OAuth family / force-close transports), or null if not found. */
export function revokeConnector(wallet: string, id: string): ConnectorRow | null {
  const row = byHash.get(id);
  if (!row || row.wallet !== wallet.toLowerCase()) return null;
  if (!row.revoked) { row.revoked = true; persist(); }
  return row;
}

/** Revoke ALL of a wallet's connectors. Returns the affected rows. */
export function revokeAllConnectors(wallet: string): ConnectorRow[] {
  const set = byWallet.get(wallet.toLowerCase());
  if (!set) return [];
  const rows: ConnectorRow[] = [];
  for (const h of set) {
    const r = byHash.get(h);
    if (r && !r.revoked) { r.revoked = true; rows.push(r); }
  }
  if (rows.length) persist();
  return rows;
}

/**
 * Register (or refresh) the connector row for an OAuth web client (claude.ai / ChatGPT).
 *
 * A web client is represented as ONE connector row per (wallet, clientId) so the dashboard
 * shows a single live entry per web app — NOT one per hourly token rotation. Each successful
 * authorization_code issuance mints a fresh token family; we bind the row to that `family`
 * and SUPERSEDE (delete) any prior NON-revoked row for the same client, whose family is now
 * dead. Revoked rows are kept (audit). Revoking this row kills the current family — the
 * caller does `revokeFamily(row.family)` so the web client's tokens stop and it must re-auth.
 *
 * Unlike a CLI row, the raw token here is a phantom (never exposed): the web client
 * authenticates with its OAuth access token, which resolves via the OAuth store, not via
 * `resolveConnector`. The row exists purely for the unified list + family-scoped revoke.
 */
export function registerOauthConnector(opts: {
  wallet: string;
  clientId: string;
  label: string;
  family: string;
  ttlS?: number;
}): ConnectorRow {
  const wallet = opts.wallet.toLowerCase();
  const set = byWallet.get(wallet);
  if (set) {
    for (const h of [...set]) {
      const r = byHash.get(h);
      if (r && r.kind === "oauth" && r.clientId === opts.clientId && !r.revoked) {
        byHash.delete(h);
        set.delete(h);
      }
    }
  }
  const { row } = mintConnector({
    wallet,
    label: opts.label,
    kind: "oauth",
    clientId: opts.clientId,
    family: opts.family,
    ttlS: opts.ttlS,
  });
  return row;
}

// ── management-signature authorization (EIP-191 readable text, replay-protected) ──

/** The text the wallet signs to add/revoke a connector. DOMAIN-SEPARATED from the
 *  EIP-712 key-deriving message (different scheme + prefix), so this signature can
 *  NEVER be replayed to derive the memory key. Client + server MUST build this identically. */
export function connectorMgmtMessage(opts: {
  action: "add" | "revoke" | "revoke-all";
  wallet: string;
  label?: string;
  connectorId?: string;
  issuedAt: number; // ms
}): string {
  const lines = [`Arca: ${opts.action} connector`, "", `vault: ${getAddress(opts.wallet)}`];
  if (opts.action === "add") lines.push(`label: ${opts.label ?? ""}`);
  else if (opts.action === "revoke") lines.push(`connector: ${opts.connectorId ?? ""}`);
  lines.push(`issued: ${opts.issuedAt}`);
  return lines.join("\n");
}

export interface MgmtVerifyResult { ok: boolean; reason?: string }

/** Verify a management signature: recovers to `wallet`, fresh, single-use. */
export function verifyMgmtSig(opts: {
  wallet: string;
  message: string;
  signature: string;
  issuedAt: number; // ms
  now?: number;
}): MgmtVerifyResult {
  const now = opts.now ?? Date.now();
  if (opts.issuedAt > now + MGMT_FUTURE_MS) return { ok: false, reason: "ts-future" };
  if (opts.issuedAt < now - MGMT_FRESH_MS) return { ok: false, reason: "ts-stale" };
  const sigKey = sha(opts.signature);
  if (consumedMgmtSigs.has(sigKey)) return { ok: false, reason: "replay" };
  let recovered: string;
  try { recovered = verifyMessage(opts.message, opts.signature); }
  catch (e) { return { ok: false, reason: `sig-decode: ${(e as Error).message.slice(0, 40)}` }; }
  if (recovered.toLowerCase() !== opts.wallet.toLowerCase()) return { ok: false, reason: "sig-mismatch" };
  consumedMgmtSigs.add(sigKey);
  return { ok: true };
}

/** Test-only reset (so unit tests start clean). */
export function __resetConnectorsForTest(): void {
  byHash.clear();
  byWallet.clear();
  consumedMgmtSigs.clear();
}
