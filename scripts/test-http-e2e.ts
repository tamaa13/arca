/**
 * Hosted MCP — full per-user path over HTTP (the "front door works" proof).
 *
 * Boots the real http-server, then exercises it exactly as the dashboard + an
 * agent would: POST /session (SIWE-style sign) → fund + delegate the signer →
 * connect an MCP client with the bearer token → save_memory → recall_memory.
 *
 * Run: ARCA_RPC=…testnet ARCA_INDEXER=…testnet ARCA_CHAIN_ID=16602 \
 *      ARCA_REGISTRY_ADDR=0xc196… bun scripts/test-http-e2e.ts
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { JsonRpcProvider, Wallet, parseEther } from "ethers";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { RegistryClient } from "../src/registry/client.js";
import { ARCA_KEY_DOMAIN, ARCA_KEY_TYPES, arcaKeyMessage } from "../src/wallet/sig-key.js";

const PORT = "8799";
const BASE = `http://localhost:${PORT}`;
const V2 = process.env.ARCA_REGISTRY_ADDR ?? "0xc196C28886c93462f55A78134b5bF6118A3f5860";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const text = (r: any) => r?.content?.map((c: any) => c.text).join("\n") ?? "";

const provider = new JsonRpcProvider("https://evmrpc-testnet.0g.ai", 16602);
const walletKey = fs.readFileSync(path.join(os.homedir(), ".arca", "key"), "utf8").trim();
const wallet = new Wallet(walletKey, provider);

// boot the real server with the testnet config.
const server = spawn("bun", ["src/transport/http-server.ts"], {
  env: { ...process.env, ARCA_PORT: PORT, ARCA_REGISTRY_ADDR: V2 },
  stdio: "inherit",
});
const done = (code: number) => { try { server.kill("SIGKILL"); } catch {} process.exit(code); };

try {
  // wait for /health.
  for (let i = 0; ; i++) {
    try { if ((await fetch(`${BASE}/health`)).ok) break; } catch {}
    if (i > 40) throw new Error("server did not become healthy");
    await sleep(250);
  }
  console.log("✓ server healthy");

  // 1. login: sign the Arca EIP-712 → POST /session.
  const signature = await wallet.signTypedData(ARCA_KEY_DOMAIN, ARCA_KEY_TYPES, arcaKeyMessage());
  const sess = await fetch(`${BASE}/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ wallet: wallet.address, signature }),
  }).then((r) => r.json());
  console.log("✓ /session → token", String(sess.token).slice(0, 18) + "…", "| signer", sess.signerAddress);

  // 2. deposit + authorize the signer (what the dashboard guides the user to do).
  await (await wallet.sendTransaction({ to: sess.signerAddress, value: parseEther("0.06"), gasPrice: 5_000_000_000n })).wait(1);
  await new RegistryClient(walletKey, V2).setDelegate(sess.signerAddress, true);
  console.log("✓ funded + delegated the signer");

  // 3. connect an MCP client with the bearer token (exactly like an agent).
  const transport = new StreamableHTTPClientTransport(new URL(sess.connectorUrl), {
    requestInit: { headers: { Authorization: `Bearer ${sess.token}` } },
  });
  const client = new Client({ name: "arca-smoke", version: "0.0.1" });
  await client.connect(transport);
  const tools = (await client.listTools()).tools.map((t) => t.name);
  console.log("✓ MCP connected | tools:", tools.join(", "));

  // 4. save + recall over HTTP.
  const marker = `http-e2e ${Date.now()}`;
  console.log("save:", text(await client.callTool({ name: "save_memory", arguments: { text: marker } })));

  let found = false;
  for (let i = 0; i < 18; i++) {
    const out = text(await client.callTool({ name: "recall_memory", arguments: { query: "http-e2e" } }));
    if (out.includes(marker)) { found = true; console.log(`✓ recall (try ${i + 1}): found`); break; }
    console.log(`  recall try ${i + 1}: not finalized yet…`);
    await sleep(5000);
  }
  await client.close();
  console.log(found ? "\n✅ HOSTED MCP PER-USER PASS — /session → token → agent save/recall over HTTP" : "\n❌ FAIL");
  done(found ? 0 : 1);
} catch (err) {
  console.error("✗ error:", err instanceof Error ? err.message : err);
  done(1);
}
