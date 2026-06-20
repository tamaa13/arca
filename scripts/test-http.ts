/** Phase 1a proof: connect to the remote Arca MCP over Streamable HTTP and run
 *  the full loop (initialize → list tools → save → recall) — same as any agent would. */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const url = new URL(process.env.ARCA_URL ?? "http://localhost:8787/mcp");
const bearer = process.env.ARCA_BEARER ?? "";

const transport = new StreamableHTTPClientTransport(url, {
  requestInit: bearer ? { headers: { Authorization: `Bearer ${bearer}` } } : undefined,
});
const client = new Client({ name: "arca-test-client", version: "0.0.1" });

await client.connect(transport);
console.log("✓ connected over Streamable HTTP");

const tools = await client.listTools();
console.log("tools:", tools.tools.map((t) => t.name).join(", "));

const marker = `remote transport proof ${Date.now()}`;
const saved = (await client.callTool({
  name: "save_memory",
  arguments: { text: marker },
})) as { content?: { text?: string }[] };
console.log("save :", saved.content?.[0]?.text);

// Background upload finalizes async — poll recall until the blob is retrievable.
let found = "";
for (let i = 0; i < 10; i++) {
  await new Promise((r) => setTimeout(r, 5000));
  const r = (await client.callTool({
    name: "recall_memory",
    arguments: { query: "transport proof" },
  })) as { content?: { text?: string }[] };
  const text = r.content?.[0]?.text ?? "";
  if (text.includes(marker)) {
    found = text;
    console.log(`recall (try ${i + 1}): found`);
    break;
  }
  console.log(`recall (try ${i + 1}): not finalized yet…`);
}

await client.close();
console.log(found ? `\n✅ 1a PASS — save→recall over remote HTTP:\n   "${found.split("\n").find((l) => l.includes(marker))}"` : "\n❌ recall never finalized");
process.exit(found ? 0 : 1);
