/**
 * Minimal Arca MCP client — lets THIS session save/recall into a vault over Streamable-HTTP
 * (this Claude Code session has no arca MCP tool, so we drive the protocol directly).
 *   ARCA_URL=http://localhost:8790/mcp ARCA_TOKEN=arca_live_… bun scripts/arca-mcp-cli.ts save "text"
 *   ARCA_URL=… ARCA_TOKEN=… bun scripts/arca-mcp-cli.ts recall "query"
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const url = process.env.ARCA_URL || "http://localhost:8790/mcp";
const token = process.env.ARCA_TOKEN;
if (!token) { console.error("ARCA_TOKEN required"); process.exit(1); }
const action = process.argv[2];
// arg from argv, or read the whole of stdin when arg is "-" (for long multi-line context)
let arg = process.argv[3] ?? "";
if (arg === "-") arg = await new Response(Bun.stdin.stream()).text();

const transport = new StreamableHTTPClientTransport(new URL(url), {
  requestInit: { headers: { Authorization: `Bearer ${token}` } },
});
const client = new Client({ name: "arca-session-cli", version: "1" });

const textOf = (r: any) => (r?.content ?? []).map((c: any) => c?.text ?? "").join("\n");
// recall downloads + decrypts the WHOLE vault, so it scales with vault size — give it room.
const TIMEOUT = Number(process.env.ARCA_TIMEOUT_MS ?? 180000);

try {
  await client.connect(transport);
  if (action === "save") {
    const r = await client.callTool({ name: "save_memory", arguments: { text: arg } }, undefined, { timeout: TIMEOUT });
    console.log("SAVE →", textOf(r));
  } else if (action === "recall") {
    const r = await client.callTool({ name: "recall_memory", arguments: { query: arg } }, undefined, { timeout: TIMEOUT });
    console.log("RECALL →", textOf(r));
  } else {
    console.error("action must be save|recall");
    process.exit(2);
  }
  await client.close();
} catch (e) {
  console.error("✗", e instanceof Error ? e.message : e);
  process.exit(1);
}
