#!/usr/bin/env -S npx tsx
/**
 * Arca CLI — `arca init`.
 *
 * Sets up the user's local key, prints funding + backup guidance, and wires the
 * Arca MCP server into Claude Code and Codex so both agents can save/recall
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
import { ArcaMemoryStore } from "../memory/store.js";
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
  ARCA_RPC: "https://evmrpc-testnet.0g.ai",
  ARCA_INDEXER: "https://indexer-storage-testnet-turbo.0g.ai",
  ARCA_CHAIN_ID: "16602",
  ARCA_REGISTRY_ADDR: "0xCcFbEdd5E10051399CA2B6ea1fDF1B62126d4ECD",
};

/** Explicit mainnet env (matches the OG config defaults — used for project wiring). */
const MAINNET_ENV: Record<string, string> = {
  ARCA_RPC: "https://evmrpc.0g.ai",
  ARCA_INDEXER: "https://indexer-storage-turbo.0g.ai",
  ARCA_CHAIN_ID: "16661",
  // v1 self-anchor registry (this CLI uses the local-key/self-anchor model). The v2
  // owner-mapping registry is 0xbf97… (mainnet) — see src/types.ts / deploy/mainnet.env.
  ARCA_REGISTRY_ADDR: "0x746Cb7B6eC8521262b01E2788188fC475f95216e",
};

/** ~/.arca — single home for key + index (mirrors src/memory/key.ts). */
const ARCA_DIR = path.join(os.homedir(), ".arca");
const KEY_PATH = path.join(ARCA_DIR, "key");

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
 * `--import` writes the raw key to ~/.arca/key first, then loadOrCreate()
 * reads + canonicalizes it.
 */
function setupKey(importHex?: string): { privKeyHex: string; address: string } {
  fs.mkdirSync(ARCA_DIR, { recursive: true });

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
 * Wire the Arca MCP server into Claude Code.
 * Tries the `claude` CLI; falls back to printing the exact command + manual
 * config edit if the CLI is absent.
 */
function wireClaudeCode(env: Record<string, string>): boolean {
  const envArgs = Object.entries(env).flatMap(([k, v]) => ["-e", `${k}=${v}`]);
  const manual = `claude mcp add arca -s user ${envArgs.join(" ")} -- ${TSX_BIN} ${MCP_SERVER_PATH}`;
  try {
    // Use the real CLI so it writes ~/.claude.json in the correct shape and is
    // idempotent on its own (re-adding the same server overwrites it).
    execFileSync(
      "claude",
      ["mcp", "add", "arca", "-s", "user", ...envArgs, "--", TSX_BIN, MCP_SERVER_PATH],
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
 * Merge an `mcp.arca` entry into OpenCode's config (~/.config/opencode/opencode.json).
 * Reads + merges so other servers/settings are never clobbered; overwrites only
 * the `arca` entry (idempotent).
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
  mcp.arca = {
    type: "local",
    command: [TSX_BIN, MCP_SERVER_PATH],
    ...(Object.keys(env).length > 0 ? { environment: env } : {}),
    enabled: true,
  };
  cfg.mcp = mcp;

  fs.writeFileSync(ocConfig, `${JSON.stringify(cfg, null, 2)}\n`, { encoding: "utf8" });
  console.log("  ✓ OpenCode — wrote mcp.arca to ~/.config/opencode/opencode.json");
  return true;
}

/**
 * Drop project-scoped arca config into the CURRENT directory: .mcp.json (Claude
 * Code) + opencode.json (OpenCode), plus a memory-override CLAUDE.md / AGENTS.md
 * if absent. Launch the agent in this folder and arca loads — no global wiring.
 */
function wireHere(env: Record<string, string>): void {
  const cwd = process.cwd();

  const mcpJson = {
    mcpServers: { arca: { command: TSX_BIN, args: [MCP_SERVER_PATH], env } },
  };
  fs.writeFileSync(path.join(cwd, ".mcp.json"), `${JSON.stringify(mcpJson, null, 2)}\n`);

  const ocJson = {
    $schema: "https://opencode.ai/config.json",
    mcp: {
      arca: {
        type: "local",
        command: [TSX_BIN, MCP_SERVER_PATH],
        environment: env,
        enabled: true,
      },
    },
  };
  fs.writeFileSync(path.join(cwd, "opencode.json"), `${JSON.stringify(ocJson, null, 2)}\n`);

  // Memory-override so agents prefer arca over any built-in memory. Never clobber
  // an existing file (a real project may already have CLAUDE.md / AGENTS.md).
  const override =
    "# Memory here = the arca MCP\n\n" +
    "Use the `arca` MCP tools (`save_memory` / `recall_memory`) for ALL memory\n" +
    "operations in this folder. Do not use any other memory system, file, or directory.\n";
  for (const f of ["CLAUDE.md", "AGENTS.md"]) {
    const p = path.join(cwd, f);
    if (!fs.existsSync(p)) fs.writeFileSync(p, override);
  }

  rule();
  console.log("  ✓ arca wired into this folder:");
  console.log(`    ${cwd}`);
  console.log("    • .mcp.json (Claude Code)  • opencode.json (OpenCode)");
  console.log("    • CLAUDE.md / AGENTS.md memory-override (only if absent)");
  console.log(`    network: ${env.ARCA_RPC?.includes("testnet") ? "TESTNET" : "mainnet"}`);
  console.log("    → launch `claude` or `opencode` HERE; approve arca.");
  rule();
}

// ---------------------------------------------------------------------------
// init command
// ---------------------------------------------------------------------------

function runInit(opts: { import?: string; testnet?: boolean; wire?: boolean }): void {
  const env = opts.testnet ? TESTNET_ENV : {};

  // 1. Key.
  const { address } = setupKey(opts.import);
  rule();
  console.log("  Arca key ready.");
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
  console.log("  ⚠️  BACK UP YOUR KEY (~/.arca/key). If you lose it, your memory is");
  console.log("      GONE FOREVER — there is no recovery, by design.");

  // 4. Wire the MCP server into the agents (unless --no-wire).
  rule();
  if (opts.wire === false) {
    console.log("  • Skipped agent wiring (--no-wire).");
    console.log(
      "    Use a project-scoped .mcp.json (Claude Code) / opencode.json (OpenCode) instead.",
    );
    rule();
    return;
  }
  console.log(
    `  Wiring Arca MCP server into your agents (${opts.testnet ? "TESTNET" : "mainnet"})…`,
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
    console.log(`  ✓ wired into ${wired.join(" / ")} — restart them to load Arca`);
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
  .name("arca")
  .description(
    "Arca — user-owned, cross-agent persistent memory on 0G (you hold the key).",
  )
  .version("0.0.1");

program
  .command("init")
  .description(
    "Set up your Arca key, print funding + backup guidance, and wire the MCP server into Claude Code + OpenCode.",
  )
  .option(
    "--import <privKeyHex>",
    "Import an existing secp256k1 private key (hex) instead of generating one.",
  )
  .option(
    "--testnet",
    "Wire + target 0G Galileo testnet (healthy storage) instead of mainnet.",
  )
  .option(
    "--no-wire",
    "Generate key + show funding/backup, but skip wiring agents (use project-scoped configs).",
  )
  .action((opts: { import?: string; testnet?: boolean; wire?: boolean }) => {
    runInit(opts);
  });

program
  .command("wire")
  .description(
    "Drop arca config into the CURRENT folder (project-scoped), then launch claude/opencode here.",
  )
  .option("--testnet", "Target 0G Galileo testnet instead of mainnet.")
  .action((opts: { testnet?: boolean }) => {
    wireHere(opts.testnet ? TESTNET_ENV : MAINNET_ENV);
  });

// ---------------------------------------------------------------------------
// save / recall — manual test + demo from the terminal (same store the MCP uses)
// ---------------------------------------------------------------------------

/** Wire the memory store exactly like the MCP server does. */
function buildStore(): ArcaMemoryStore {
  const { privKeyHex } = new FileKeyManager().loadOrCreate();
  const registry = OG.registry ? new RegistryClient(privKeyHex) : undefined;
  return new ArcaMemoryStore(
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
  console.error("arca: error —", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
