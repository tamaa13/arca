/**
 * Deploy the Arca MCP into a SEALED 0G Sandbox (TDX) container — the operator-blind
 * production host. Orchestrates: acknowledge + deposit → createSandbox(custom image,
 * sealed) → poll the inbound endpoint /health → print the connector URL.
 *
 * Prereqs (need your accounts/funds — flagged, not done here):
 *   1. Build + push the image:  docker build -t <registry>/arca:latest .  &&  docker push …
 *      (the 0G Sandbox provider must be able to pull <registry>/arca:latest)
 *   2. Operator wallet funded with testnet 0G (faucet.0g.ai) for deposit + gas.
 *
 * Run: ARCA_IMAGE=<registry>/arca:latest bun scripts/sandbox-deploy.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Wallet, JsonRpcProvider } from "ethers";
import { SandboxClient } from "../src/sandbox/client.js";
import { SandboxSettlement } from "../src/sandbox/settlement.js";
import { buildSandboxEndpoint } from "../src/sandbox/constants.js";

const IMAGE = process.env.ARCA_IMAGE;
if (!IMAGE) {
  console.error("set ARCA_IMAGE to a pushed, provider-pullable image (see Dockerfile / this file's header)");
  process.exit(2);
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const key = fs.readFileSync(path.join(os.homedir(), ".arca", "key"), "utf8").trim();
const operator = new Wallet(key, new JsonRpcProvider("https://evmrpc-testnet.0g.ai", 16602));
const client = new SandboxClient(operator);
const settlement = await SandboxSettlement.fromProvider(key);

// the env the sealed MCP needs (testnet chain + registry; storage indexer must match RPC).
const containerEnv: Record<string, string> = {
  ARCA_PORT: "8080",
  ARCA_RPC: process.env.ARCA_RPC ?? "https://evmrpc-testnet.0g.ai",
  ARCA_INDEXER: process.env.ARCA_INDEXER ?? "https://indexer-storage-testnet-turbo.0g.ai",
  ARCA_CHAIN_ID: process.env.ARCA_CHAIN_ID ?? "16602",
  ARCA_REGISTRY_ADDR: process.env.ARCA_REGISTRY_ADDR ?? "0xc196C28886c93462f55A78134b5bF6118A3f5860",
};

console.log("operator:", operator.address, "| image:", IMAGE);
const funded = await settlement.ensureFunded("0.5");
console.log("✓ funded — balance", funded.balance.toString(), "wei (ack/deposit idempotent)");

// createSandbox with the custom image, SEALED. Retry while the provider sees the ack.
let sb: { id: string; state: string } | undefined;
for (let attempt = 1; attempt <= 10 && !sb; attempt++) {
  try {
    sb = await client.createSandbox({ image: IMAGE, sealed: true, name: "arca-mcp", env: containerEnv });
  } catch (e) {
    const msg = (e as Error).message;
    if (/acknowledg|402|503|orphan/i.test(msg) && attempt < 10) {
      console.log(`  create retry ${attempt} — ${msg.slice(0, 56)}`);
      await sleep(5000);
    } else throw e;
  }
}
if (!sb) throw new Error("createSandbox failed");
const endpoint = buildSandboxEndpoint(sb.id);
console.log(`✓ sealed container ${sb.id} (${sb.state}) → ${endpoint}`);

// poll the inbound endpoint until the MCP is healthy (image pull + boot ~1-3 min).
let healthy = false;
for (let i = 0; i < 60; i++) {
  try { if ((await fetch(`${endpoint}/health`, { signal: AbortSignal.timeout(8000) })).ok) { healthy = true; break; } } catch {}
  await sleep(5000);
}
console.log(healthy ? "✓ MCP healthy" : "⚠ not healthy yet — check `bun -e` getSandbox / image pull logs");
console.log(`\nDashboard : ${endpoint}/`);
console.log(`Connector : ${endpoint}/mcp   (agents use this URL + their token from /session)`);
console.log(healthy ? "\n✅ ARCA DEPLOYED to a sealed 0G Sandbox (operator-blind)" : "\n⚠ deployed; awaiting health");
process.exit(healthy ? 0 : 1);
