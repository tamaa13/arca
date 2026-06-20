/**
 * 0G Sandbox provisioning proof (Galileo testnet) — the 0G-native operator-blind
 * host for Arca's hosted MCP (NOT Phala). Proves, on real testnet 0G:
 *   - acknowledge the app's TEE (TappRegistry) + deposit runtime (SandboxServing)
 *   - UNSEALED: createSandbox + exec → arbitrary code runs in the container
 *     (surveys what a bootstrap needs to run the Arca MCP server)
 *   - SEALED (TDX): createSandbox(sealed) succeeds AND external exec is DENIED
 *     → operator-blind confirmed (this is the production mode)
 *
 * Run: bun scripts/sandbox-provision.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Wallet, JsonRpcProvider, formatEther } from "ethers";
import { SandboxClient } from "../src/sandbox/client.js";
import { SandboxSettlement } from "../src/sandbox/settlement.js";
import { buildSandboxEndpoint, SANDBOX } from "../src/sandbox/constants.js";

const key = fs.readFileSync(path.join(os.homedir(), ".arca", "key"), "utf8").trim();
const operator = new Wallet(key, new JsonRpcProvider("https://evmrpc-testnet.0g.ai", 16602));
const client = new SandboxClient(operator);
const settlement = await SandboxSettlement.fromProvider(key);

console.log("operator:", operator.address);
console.log("provider:", SANDBOX.providerAddress, "| appId:", settlement.appId);
console.log("serving :", settlement.servingAddress, "| tappRegistry:", settlement.tappAddress);

// 1. fund: acknowledge the app's TEE (TappRegistry) + deposit runtime (idempotent).
//    Low threshold — the on-contract balance funds sandboxes (create_fee 0.06 each),
//    drawn from the contract, not the wallet; only re-deposit if it runs dry.
const funded = await settlement.ensureFunded("0.05");
console.log(
  `✓ funded — ack:${funded.acknowledged ? "tx " + funded.acknowledged.slice(0, 10) : "already"}`,
  `deposit:${funded.deposited ? "tx " + funded.deposited.slice(0, 10) : "already"}`,
  `balance:${formatEther(funded.balance)} 0G`,
);

/** createSandbox with retry (provider polls the chain for the ack). */
async function createWithRetry(sealed: boolean): Promise<{ id: string; state: string }> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await client.createSandbox({ snapshot: SANDBOX.defaultSnapshot, sealed, name: `arca-${sealed ? "sealed" : "survey"}` });
    } catch (e) {
      const msg = (e as Error).message;
      if (/acknowledg|402|503|orphan/i.test(msg) && attempt < 8) {
        console.log(`  create retry ${attempt} — ${msg.slice(0, 56)}`);
        await new Promise((r) => setTimeout(r, 5000));
        continue;
      }
      throw e;
    }
  }
}

// 2. UNSEALED — exec works → prove arbitrary code runs + survey the bootstrap env.
const survey = await createWithRetry(false);
console.log(`\n✓ createSandbox(unsealed) → ${survey.id} | ${survey.state}`);
try {
  const out = await client.exec(
    survey.id,
    "echo ARCA-RUNS-IN-TEE; uname -m; whoami; for b in bun node git curl python3; do printf '%s=%s ' $b $(command -v $b || echo -); done; echo",
  );
  console.log(`✓ exec exit ${out.exitCode}:`);
  console.log((out.result ?? out.stdout ?? "").split("\n").filter(Boolean).map((l) => "    " + l).join("\n"));
} finally {
  await client.deleteSandbox(survey.id).then(() => console.log("  (survey sandbox deleted)"), () => {});
}

// 3. SEALED (TDX) — createSandbox succeeds AND external exec is denied = operator-blind.
const sealed = await createWithRetry(true);
console.log(`\n✓ createSandbox(SEALED · TDX) → ${sealed.id} | ${sealed.state}`);
let blind = false;
try {
  await client.exec(sealed.id, "echo peek-inside");
  console.log("⚠ external exec was NOT denied — sealing may be off");
} catch (e) {
  blind = /external access not allowed|sealed/i.test((e as Error).message);
  console.log(blind ? "✓ external exec DENIED → operator-blind (sealed TDX TEE) confirmed" : `⚠ unexpected: ${(e as Error).message.slice(0, 70)}`);
}
console.log("  inbound endpoint (where the MCP would serve):", buildSandboxEndpoint(sealed.id));
await client.deleteSandbox(sealed.id).then(() => console.log("  (sealed sandbox deleted — burn stopped)"), () => {});

console.log(
  blind
    ? "\n✅ 0G SANDBOX PROOF PASS — Arca provisions a SEALED TDX-TEE container (operator-blind), 0G-native, deposit-funded"
    : "\n⚠ provisioned but sealing unconfirmed",
);
process.exit(blind ? 0 : 1);
