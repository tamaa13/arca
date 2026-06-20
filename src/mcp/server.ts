/**
 * Arca MCP server — the bridge agents (Claude Code, Codex) connect to.
 *
 * Transport: stdio. The host spawns this file as a subprocess and talks MCP
 * over stdin/stdout, so STDOUT IS THE PROTOCOL CHANNEL — every log MUST go to
 * stderr (console.error), never console.log.
 *
 * Two tools, both backed by the shared ArcaMemoryStore (encrypt -> 0G -> index):
 *   - save_memory({ text })      -> store.save(text)   -> confirmation w/ id + rootHash
 *   - recall_memory({ query? })  -> store.recall(query) -> matching texts (newest first)
 *
 * Wiring happens ONCE at startup: load (or create) the user's secp256k1 key,
 * then build the store over the real 0G Storage + crypto impls.
 *
 * Coded against @modelcontextprotocol/sdk v1.x (resolves to 1.29.0):
 *   - McpServer + registerTool(name, { description, inputSchema }, cb) [current, non-deprecated API]
 *   - StdioServerTransport
 *   - inputSchema is a raw zod shape ({ key: zodType }); the callback receives parsed args.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
// TODO(pm): `zod` is a required (non-optional) peer dependency of
// @modelcontextprotocol/sdk but is NOT declared in package.json. It usually
// resolves transitively, but please add an explicit "zod": "^3.25 || ^4.0"
// to dependencies so installs are deterministic.
import { z } from "zod";

import { FileKeyManager } from "../memory/key.js";
import { ArcaMemoryStore } from "../memory/store.js";
import { OgStorageClient } from "../og/storage.js";
import { ogCrypto } from "../og/crypto.js";
import { RegistryClient } from "../registry/client.js";
import { OG } from "../types.js";

// --- wire the store once at startup -----------------------------------------

const { privKeyHex } = new FileKeyManager().loadOrCreate();
// On-chain registry is optional — used only once ArcaRegistry is deployed
// (OG.registry / ARCA_REGISTRY_ADDR set). Until then the local index drives recall.
const registry = OG.registry ? new RegistryClient(privKeyHex) : undefined;
const store = new ArcaMemoryStore(
  new OgStorageClient(privKeyHex),
  ogCrypto,
  privKeyHex,
  registry,
);

/** Friendly one-liner for any thrown error (0G calls can fail / be slow). */
function errText(prefix: string, err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return `${prefix}: ${msg}`;
}

/** Wrap text in the MCP tool-result envelope. */
function ok(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

/** Same envelope, flagged as an error so the host shows it as a failure. */
function fail(text: string) {
  return { content: [{ type: "text" as const, text }], isError: true };
}

// --- server + tools ----------------------------------------------------------

const server = new McpServer({ name: "arca", version: "0.0.1" });

server.registerTool(
  "save_memory",
  {
    title: "Save memory",
    description:
      "Persist a fact/note to the user's own cross-agent memory. The text is " +
      "ECIES/AES-encrypted to the user's key and stored on 0G Storage " +
      "(un-ruggable once anchored). The user holds the key.",
    inputSchema: {
      text: z
        .string()
        .min(1)
        .describe("The fact or note to remember (plaintext)."),
    },
  },
  async ({ text }) => {
    try {
      const record = await store.save(text);
      const where = record.pending
        ? `root ${record.rootHash} anchored on 0G Chain — storage upload pending (0G storage syncing), will finalize automatically`
        : `root ${record.rootHash} — encrypted + stored on 0G`;
      return ok(`Saved memory ${record.id} (${where}).`);
    } catch (err) {
      return fail(errText("Failed to save memory", err));
    }
  },
);

server.registerTool(
  "recall_memory",
  {
    title: "Recall memory",
    description:
      "Retrieve the user's saved memories from 0G (decrypted with the user's " +
      "key), newest first. Pass an optional `query` to filter to memories " +
      "whose text contains that substring.",
    inputSchema: {
      query: z
        .string()
        .optional()
        .describe("Optional case-insensitive substring filter."),
    },
  },
  async ({ query }) => {
    try {
      const records = await store.recall(query);
      if (records.length === 0) {
        return ok(query ? `No memories matching "${query}".` : "No memories.");
      }
      // Newest first (store.recall already sorts); render text per line.
      const body = records.map((r) => `- ${r.text}`).join("\n");
      return ok(body);
    } catch (err) {
      return fail(errText("Failed to recall memory", err));
    }
  },
);

// --- boot --------------------------------------------------------------------

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stderr only — stdout is the MCP channel.
  console.error("arca MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error starting arca MCP server:", err);
  process.exit(1);
});
