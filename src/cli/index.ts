#!/usr/bin/env -S npx tsx
/**
 * Ingat CLI — `ingat init`.
 *
 * Sets up the user's local key, prints funding + backup guidance, and wires the
 * Ingat MCP server into Claude Code and Codex so both agents can save/recall
 * memory through it.
 *
 * Lean by design: only `init` for now (hero loop for Jun 23). Idempotent —
 * safe to run twice.
 *
 * ESM / NodeNext: relative imports use `.js`; repo paths resolved from
 * `import.meta.url`. Node built-ins + `commander` + the key manager only.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { FileKeyManager } from "../memory/key.js";
import { IngatMemoryStore } from "../memory/store.js";
import { OgStorageClient } from "../og/storage.js";
import { ogCrypto } from "../og/crypto.js";
import { RegistryClient } from "../registry/client.js";
import { OG } from "../types.js";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

/** Absolute path to <repo>/src/cli/index.ts. */
const THIS_FILE = fileURLToPath(import.meta.url);
/** <repo> root = two levels up from src/cli/index.ts. */
const REPO_ROOT = path.resolve(path.dirname(THIS_FILE), "..", "..");
/** Absolute path the agents will spawn for the MCP server. */
const MCP_SERVER_PATH = path.join(REPO_ROOT, "src", "mcp", "server.ts");
/** Local tsx binary — robust regardless of the agent's working directory. */
const TSX_BIN = path.join(REPO_ROOT, "node_modules", ".bin", "tsx");

/** Env that targets 0G Galileo testnet (healthy storage) instead of mainnet. */
const TESTNET_ENV: Record<string, string> = {
  INGAT_RPC: "https://evmrpc-testnet.0g.ai",
  INGAT_INDEXER: "https://indexer-storage-testnet-turbo.0g.ai",
  INGAT_CHAIN_ID: "16602",
  INGAT_REGISTRY_ADDR: "0xCcFbEdd5E10051399CA2B6ea1fDF1B62126d4ECD",
};

/** ~/.ingat — single home for key + index (mirrors src/memory/key.ts). */
const INGAT_DIR = path.join(os.homedir(), ".ingat");
const KEY_PATH = path.join(INGAT_DIR, "key");

// ---------------------------------------------------------------------------
// Pretty-print helpers (no color deps — plain stdout)
// ---------------------------------------------------------------------------

function rule(): void {
  console.log("─".repeat(72));
}

// ---------------------------------------------------------------------------
// Key setup
// ---------------------------------------------------------------------------

/**
 * Normalize an imported private key hex to ethers' 0x-prefixed form by round-
 * tripping it through FileKeyManager's loader (which validates via ethers).
 * `--import` writes the raw key to ~/.ingat/key first, then loadOrCreate()
 * reads + canonicalizes it.
 */
function setupKey(importHex?: string): { privKeyHex: string; address: string } {
  fs.mkdirSync(INGAT_DIR, { recursive: true });

  if (importHex) {
    const raw = importHex.trim();
    const normalized = raw.startsWith("0x") ? raw : `0x${raw}`;
    // Persist the imported key with restrictive perms BEFORE handing off to the
    // key manager so loadOrCreate() picks it up instead of generating a new one.
    fs.writeFileSync(KEY_PATH, normalized, { encoding: "utf8", mode: 0o600 });
    fs.chmodSync(KEY_PATH, 0o600);
  }

  // loadOrCreate() validates the key via ethers and returns the canonical hex.
  // (Throws on a malformed --import, which is the behavior we want.)
  return new FileKeyManager().loadOrCreate();
}

// ---------------------------------------------------------------------------
// Agent wiring
// ---------------------------------------------------------------------------

/**
 * Wire the Ingat MCP server into Claude Code.
 * Tries the `claude` CLI; falls back to printing the exact command + manual
 * config edit if the CLI is absent.
 */
function wireClaudeCode(env: Record<string, string>): boolean {
  const envArgs = Object.entries(env).flatMap(([k, v]) => ["-e", `${k}=${v}`]);
  const manual = `claude mcp add ingat -s user ${envArgs.join(" ")} -- ${TSX_BIN} ${MCP_SERVER_PATH}`;
  try {
    // Use the real CLI so it writes ~/.claude.json in the correct shape and is
    // idempotent on its own (re-adding the same server overwrites it).
    execFileSync(
      "claude",
      ["mcp", "add", "ingat", "-s", "user", ...envArgs, "--", TSX_BIN, MCP_SERVER_PATH],
      { stdio: "ignore" },
    );
    console.log("  ✓ Claude Code — added via `claude mcp add` (user scope)");
    return true;
  } catch {
    console.log("  • Claude Code — `claude` CLI not found. Add it manually:");
    console.log(`      ${manual}`);
    return false;
  }
}

/**
 * Merge an `mcp.ingat` entry into OpenCode's config (~/.config/opencode/opencode.json).
 * Reads + merges so other servers/settings are never clobbered; overwrites only
 * the `ingat` entry (idempotent).
 */
function wireOpenCode(env: Record<string, string>): boolean {
  const ocDir = path.join(os.homedir(), ".config", "opencode");
  const ocConfig = path.join(ocDir, "opencode.json");
  fs.mkdirSync(ocDir, { recursive: true });

  let cfg: Record<string, unknown> = {};
  if (fs.existsSync(ocConfig)) {
    try {
      cfg = JSON.parse(fs.readFileSync(ocConfig, "utf8")) as Record<string, unknown>;
    } catch {
      console.log("  • OpenCode — ~/.config/opencode/opencode.json is not valid JSON; left untouched.");
      return false;
    }
  }

  cfg["$schema"] ??= "https://opencode.ai/config.json";
  const mcp = (cfg.mcp as Record<string, unknown>) ?? {};
  mcp.ingat = {
    type: "local",
    command: [TSX_BIN, MCP_SERVER_PATH],
    ...(Object.keys(env).length > 0 ? { environment: env } : {}),
    enabled: true,
  };
  cfg.mcp = mcp;

  fs.writeFileSync(ocConfig, `${JSON.stringify(cfg, null, 2)}\n`, { encoding: "utf8" });
  console.log("  ✓ OpenCode — wrote mcp.ingat to ~/.config/opencode/opencode.json");
  return true;
}

// ---------------------------------------------------------------------------
// init command
// ---------------------------------------------------------------------------

function runInit(opts: { import?: string; testnet?: boolean }): void {
  const env = opts.testnet ? TESTNET_ENV : {};

  // 1. Key.
  const { address } = setupKey(opts.import);
  rule();
  console.log("  Ingat key ready.");
  console.log(`  Address: ${address}`);
  console.log(`  Stored at: ${KEY_PATH} (chmod 600)`);

  // 2. Funding.
  rule();
  console.log("  FUND THIS ADDRESS");
  if (opts.testnet) {
    console.log(
      "  Fund this address with a little 0G on Galileo TESTNET (chainId 16602)",
    );
    console.log("  from faucet.0g.ai to store memory while testing.");
  } else {
    console.log(
      "  Fund this address with ~2 0G on 0G mainnet (chainId 16661) to store memory.",
    );
    console.log(
      "  Storage is pay-once + cheap (~0.13 0G/GB) — this lasts effectively forever",
    );
    console.log("  for personal memory.");
  }

  // 3. LOUD backup warning. exportKey() reveals the key once.
  const privKeyHex = new FileKeyManager().exportKey();
  rule();
  console.log("  ⚠️  BACK UP YOUR KEY  ⚠️");
  console.log(`  Your private key (${KEY_PATH}):`);
  console.log("");
  console.log(`      ${privKeyHex}`);
  console.log("");
  console.log("  ⚠️  BACK UP YOUR KEY (~/.ingat/key). If you lose it, your memory is");
  console.log("      GONE FOREVER — there is no recovery, by design.");

  // 4. Wire the MCP server into the agents.
  rule();
  console.log(
    `  Wiring Ingat MCP server into your agents (${opts.testnet ? "TESTNET" : "mainnet"})…`,
  );
  console.log(`  Server: ${TSX_BIN} ${MCP_SERVER_PATH}`);
  console.log("");
  const claudeOk = wireClaudeCode(env);
  const ocOk = wireOpenCode(env);

  rule();
  const wired: string[] = [];
  if (claudeOk) wired.push("Claude Code");
  if (ocOk) wired.push("OpenCode");
  if (wired.length > 0) {
    console.log(`  ✓ wired into ${wired.join(" / ")} — restart them to load Ingat`);
  } else {
    console.log("  • No agents auto-wired — see the manual steps above.");
  }
  rule();
}

// ---------------------------------------------------------------------------
// CLI definition
// ---------------------------------------------------------------------------

const program = new Command();

program
  .name("ingat")
  .description(
    "Ingat — user-owned, cross-agent persistent memory on 0G (you hold the key).",
  )
  .version("0.0.1");

program
  .command("init")
  .description(
    "Set up your Ingat key, print funding + backup guidance, and wire the MCP server into Claude Code + OpenCode.",
  )
  .option(
    "--import <privKeyHex>",
    "Import an existing secp256k1 private key (hex) instead of generating one.",
  )
  .option(
    "--testnet",
    "Wire + target 0G Galileo testnet (healthy storage) instead of mainnet.",
  )
  .action((opts: { import?: string; testnet?: boolean }) => {
    runInit(opts);
  });

// ---------------------------------------------------------------------------
// save / recall — manual test + demo from the terminal (same store the MCP uses)
// ---------------------------------------------------------------------------

/** Wire the memory store exactly like the MCP server does. */
function buildStore(): IngatMemoryStore {
  const { privKeyHex } = new FileKeyManager().loadOrCreate();
  const registry = OG.registry ? new RegistryClient(privKeyHex) : undefined;
  return new IngatMemoryStore(
    new OgStorageClient(privKeyHex),
    ogCrypto,
    privKeyHex,
    registry,
  );
}

program
  .command("save <text...>")
  .description("Save a memory: encrypt → anchor on 0G Chain → store on 0G Storage.")
  .action(async (textParts: string[]) => {
    const text = textParts.join(" ");
    const rec = await buildStore().save(text);
    rule();
    if (rec.pending) {
      console.log(`  ✓ saved ${rec.id}`);
      console.log(`    root ${rec.rootHash} anchored on 0G Chain;`);
      console.log("    storage upload pending (0G storage syncing) — finalizes automatically.");
    } else {
      console.log(`  ✓ saved ${rec.id}`);
      console.log(`    root ${rec.rootHash} — encrypted + stored on 0G.`);
    }
    rule();
    process.exit(0);
  });

program
  .command("recall [query]")
  .description("Recall your memories (decrypted from 0G), newest first; optional substring filter.")
  .action(async (query?: string) => {
    const recs = await buildStore().recall(query);
    rule();
    if (recs.length === 0) {
      console.log(query ? `  No memories matching "${query}".` : "  No memories yet.");
    } else {
      console.log(`  ${recs.length} mem(s)${query ? ` matching "${query}"` : ""}:`);
      for (const r of recs) console.log(`   • ${r.text}`);
    }
    rule();
    process.exit(0);
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error("ingat: error —", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
