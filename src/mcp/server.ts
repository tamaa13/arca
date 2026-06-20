/**
 * Arca MCP — stdio entrypoint (v1 / local mode).
 *
 * Thin wrapper: builds the shared Arca server (tools live in ./build-server.ts)
 * and connects it over stdio. STDOUT IS THE PROTOCOL CHANNEL — logs go to stderr.
 *
 * The remote, multi-platform transport is ../transport/http-server.ts.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildArcaServer, buildStore } from "./build-server.js";

async function main(): Promise<void> {
  const server = buildArcaServer(buildStore());
  await server.connect(new StdioServerTransport());
  console.error("arca MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error starting arca MCP server:", err);
  process.exit(1);
});
