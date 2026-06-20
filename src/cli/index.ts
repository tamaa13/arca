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

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

/** Absolute path to <repo>/src/cli/index.ts. */
const THIS_FILE = fileURLToPath(import.meta.url);
/** <repo> root = two levels up from src/cli/index.ts. */
const REPO_ROOT = path.resolve(path.dirname(THIS_FILE), "..", "..");
/** Absolute path the agents will spawn for the MCP server. */
const MCP_SERVER_PATH = path.join(REPO_ROOT, "src", "mcp", "server.ts");

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
function wireClaudeCode(): boolean {
  const addCmd = `claude mcp add ingat -- npx tsx ${MCP_SERVER_PATH}`;
  try {
    // Use the real CLI so it writes ~/.claude.json in the correct shape and is
    // idempotent on its own (re-adding the same server is a no-op / overwrite).
    execFileSync(
      "claude",
      ["mcp", "add", "ingat", "--", "npx", "tsx", MCP_SERVER_PATH],
      { stdio: "ignore" },
    );
    console.log("  ✓ Claude Code — added via `claude mcp add`");
    return true;
  } catch {
    console.log("  • Claude Code — `claude` CLI not found. Add it manually:");
    console.log(`      ${addCmd}`);
    console.log("    …or add this to the \"mcpServers\" object in ~/.claude.json:");
    console.log(
      '      "ingat": { "command": "npx", "args": ["tsx", ' +
        `"${MCP_SERVER_PATH}"] }`,
    );
    return false;
  }
}

/**
 * Ensure an `[mcp_servers.ingat]` block exists in ~/.codex/config.toml.
 * Idempotent: if the block is already present, leaves the file untouched
 * (config.toml is the user's — never clobber other servers/settings).
 */
function wireCodex(): boolean {
  const codexDir = path.join(os.homedir(), ".codex");
  const codexConfig = path.join(codexDir, "config.toml");

  const block =
    "\n[mcp_servers.ingat]\n" +
    'command = "npx"\n' +
    `args = ["tsx", ${JSON.stringify(MCP_SERVER_PATH)}]\n`;

  fs.mkdirSync(codexDir, { recursive: true });

  let existing = "";
  if (fs.existsSync(codexConfig)) {
    existing = fs.readFileSync(codexConfig, "utf8");
  }

  // Idempotent guard: bail if our table header is already declared.
  if (/^\s*\[mcp_servers\.ingat\]/m.test(existing)) {
    console.log("  ✓ Codex — already configured in ~/.codex/config.toml");
    return true;
  }

  // Append, ensuring a separating newline so we don't fuse onto a prior line.
  const sep = existing.length > 0 && !existing.endsWith("\n") ? "\n" : "";
  fs.writeFileSync(codexConfig, existing + sep + block, { encoding: "utf8" });
  console.log("  ✓ Codex — appended [mcp_servers.ingat] to ~/.codex/config.toml");
  return true;
}

// ---------------------------------------------------------------------------
// init command
// ---------------------------------------------------------------------------

function runInit(opts: { import?: string }): void {
  // 1. Key.
  const { address } = setupKey(opts.import);
  rule();
  console.log("  Ingat key ready.");
  console.log(`  Address: ${address}`);
  console.log(`  Stored at: ${KEY_PATH} (chmod 600)`);

  // 2. Funding.
  rule();
  console.log("  FUND THIS ADDRESS");
  console.log(
    "  Fund this address with ~2 0G on 0G mainnet (chainId 16661) to store memory.",
  );
  console.log(
    "  Storage is pay-once + cheap (~0.13 0G/GB) — this lasts effectively forever",
  );
  console.log("  for personal memory.");

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
  console.log("  Wiring Ingat MCP server into your agents…");
  console.log(`  Server: npx tsx ${MCP_SERVER_PATH}`);
  console.log("");
  const claudeOk = wireClaudeCode();
  const codexOk = wireCodex();

  rule();
  const wired: string[] = [];
  if (claudeOk) wired.push("Claude Code");
  if (codexOk) wired.push("Codex");
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
    "Set up your Ingat key, print funding + backup guidance, and wire the MCP server into Claude Code + Codex.",
  )
  .option(
    "--import <privKeyHex>",
    "Import an existing secp256k1 private key (hex) instead of generating one.",
  )
  .action((opts: { import?: string }) => {
    runInit(opts);
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error("ingat: error —", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
