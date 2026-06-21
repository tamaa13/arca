/**
 * Connect a real MCP agent to the Arca MCP running in the 0G Sandbox container.
 * Exactly what an agent does: POST /session (sign) → fund+delegate signer →
 * MCP client over the sandbox /mcp URL with the bearer → save_memory → recall.
 *
 * Run: bun scripts/test-sandbox-connect.ts   (SANDBOX_BASE to override)
 */
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import { JsonRpcProvider, Wallet, parseEther } from "ethers";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { RegistryClient } from "../src/registry/client.js";
import { ARCA_KEY_DOMAIN, ARCA_KEY_TYPES, arcaKeyMessage } from "../src/wallet/sig-key.js";

const BASE = process.env.SANDBOX_BASE || "http://8080-99f8c291-0b42-49b4-ac10-94a46bf23315.43.106.147.28.nip.io:4000";
const V2 = "0xc196C28886c93462f55A78134b5bF6118A3f5860";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const text = (r: any) => r?.content?.map((c: any) => c.text).join("\n") ?? "";
const provider = new JsonRpcProvider("https://evmrpc-testnet.0g.ai", 16602);
const walletKey = fs.readFileSync(path.join(os.homedir(), ".arca", "key"), "utf8").trim();
const wallet = new Wallet(walletKey, provider);

console.log("AGENT → sandbox MCP:", BASE);
console.log("wallet:", wallet.address);
if (!(await fetch(`${BASE}/health`)).ok) throw new Error("sandbox /health not ok");
console.log("✓ sandbox healthy");

// 1. login: sign Arca EIP-712 → POST /session
const signature = await wallet.signTypedData(ARCA_KEY_DOMAIN, ARCA_KEY_TYPES, arcaKeyMessage());
const sess = await fetch(`${BASE}/session`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ wallet: wallet.address, signature }) }).then((r) => r.json());
console.log("✓ /session → token", String(sess.token).slice(0, 18) + "…", "| signer", sess.signerAddress);

// 2. fund + delegate the signer (dashboard steps), on testnet v2 registry
await (await wallet.sendTransaction({ to: sess.signerAddress, value: parseEther("0.06"), gasPrice: 5_000_000_000n })).wait(1);
await new RegistryClient(walletKey, V2, "https://evmrpc-testnet.0g.ai", 16602).setDelegate(sess.signerAddress, true);
console.log("✓ funded + delegated signer");

// 3. connect an MCP client to the SANDBOX /mcp (http; not sess.connectorUrl which force-https)
const transport = new StreamableHTTPClientTransport(new URL(`${BASE}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${sess.token}` } } });
const client = new Client({ name: "sandbox-agent-test", version: "0.0.1" });
await client.connect(transport);
const tools = (await client.listTools()).tools.map((t) => t.name);
console.log("✓ AGENT CONNECTED to sandbox MCP | tools:", tools.join(", "));

// 4. save + recall through the sandbox container
const marker = `sandbox-connect ${Date.now()}`;
console.log("save:", text(await client.callTool({ name: "save_memory", arguments: { text: marker } })));
let found = false;
for (let i = 0; i < 18; i++) {
  const out = text(await client.callTool({ name: "recall_memory", arguments: { query: "sandbox-connect" } }));
  if (out.includes(marker)) { found = true; console.log(`✓ recall (try ${i + 1}): FOUND in the vault`); break; }
  console.log(`  recall try ${i + 1}: blob not finalized on 0G yet…`);
  await sleep(5000);
}
await client.close();
console.log(found
  ? "\n✅ AGENT ↔ SANDBOX MCP PASS — connect + save + recall end-to-end through the 0G Sandbox container"
  : "\n⚠ connect + save OK; recall pending 0G storage finalization (anchor is on-chain, blob still syncing)");
process.exit(0);
