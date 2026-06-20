/**
 * Arca MCP factory — builds the server (save_memory / recall_memory) over a store.
 * Shared by the stdio entrypoint (server.ts) and the remote HTTP transport
 * (../transport/http-server.ts) so the tool logic lives in exactly one place.
 *
 * Phase 1a: the store is wired over a LOCAL key (FileKeyManager) — this is the
 * transport-proof milestone. Wallet-derived keys + per-user sessions land in 1b.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { FileKeyManager } from "../memory/key.js";
import { ArcaMemoryStore } from "../memory/store.js";
import { OgStorageClient } from "../og/storage.js";
import { ogCrypto } from "../og/crypto.js";
import { RegistryClient } from "../registry/client.js";
import { OG, type MemoryStore } from "../types.js";

/** Wire the memory store over the real 0G impls (local key for now). */
export function buildStore(): MemoryStore {
  const { privKeyHex } = new FileKeyManager().loadOrCreate();
  const registry = OG.registry ? new RegistryClient(privKeyHex) : undefined;
  return new ArcaMemoryStore(
    new OgStorageClient(privKeyHex),
    ogCrypto,
    privKeyHex,
    registry,
  );
}

const ok = (text: string) => ({ content: [{ type: "text" as const, text }] });
const fail = (text: string) => ({ content: [{ type: "text" as const, text }], isError: true });
const errText = (prefix: string, err: unknown) =>
  `${prefix}: ${err instanceof Error ? err.message : String(err)}`;

/** Build a fresh Arca MCP server instance bound to `store`. */
export function buildArcaServer(store: MemoryStore): McpServer {
  const server = new McpServer({ name: "arca", version: "0.0.1" });

  server.registerTool(
    "save_memory",
    {
      title: "Save memory",
      description:
        "Persist a fact/note to the user's own cross-agent memory. The text is " +
        "encrypted to the user's key and stored on 0G Storage (un-ruggable once " +
        "anchored). The user holds the key.",
      inputSchema: {
        text: z.string().min(1).describe("The fact or note to remember (plaintext)."),
      },
    },
    async ({ text }) => {
      try {
        const record = await store.save(text);
        const where = record.pending
          ? `root ${record.rootHash} anchored on 0G Chain — storage upload pending, finalizes automatically`
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
        "key), newest first. Pass an optional `query` to filter to memories whose " +
        "text contains that substring.",
      inputSchema: {
        query: z.string().optional().describe("Optional case-insensitive substring filter."),
      },
    },
    async ({ query }) => {
      try {
        const records = await store.recall(query);
        if (records.length === 0) {
          return ok(query ? `No memories matching "${query}".` : "No memories.");
        }
        return ok(records.map((r) => `- ${r.text}`).join("\n"));
      } catch (err) {
        return fail(errText("Failed to recall memory", err));
      }
    },
  );

  return server;
}
