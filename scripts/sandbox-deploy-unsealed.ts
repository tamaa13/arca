/**
 * Deploy the Arca MCP to 0G Sandbox the ANIMA WAY — base snapshot + exec-bootstrap
 * (self-serve, NO admin-only custom image). UNSEALED: the bootstrap uses toolbox exec,
 * which is denied in sealed mode, so this is NOT operator-blind — it runs on the 0G
 * Sandbox TDX platform with the key handed off via ECIES. True sealed/operator-blind
 * still needs 0G to onboard a custom image. (Mirrors anima packages/gateway bootstrap.)
 *
 * Run: bun scripts/sandbox-deploy-unsealed.ts
 */
import { Wallet } from "ethers";
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import { SandboxClient } from "../src/sandbox/client.js";
import { SandboxSettlement } from "../src/sandbox/settlement.js";
import { buildSandboxEndpoint } from "../src/sandbox/constants.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const key = fs.readFileSync(path.join(os.homedir(), ".arca", "key"), "utf8").trim();
const client = new SandboxClient(new Wallet(key));
const settlement = await SandboxSettlement.fromProvider(key);

// Proven bootstrap shape from anima/gateway: sudo -n apt, bun installer, detach via
// nohup (the exec call times out ~60s), DONE/FAIL markers. Clones Arca + runs the MCP.
const BOOT = [
  "exec > /tmp/arca-boot.log 2>&1",
  "set +e",
  'retry(){ L="$1"; shift; n=1; while [ $n -le 3 ]; do "$@" && return 0; [ $n -lt 3 ] && { echo "[$L retry $n]"; sleep $((n*5)); }; n=$((n+1)); done; return 1; }',
  "export DEBIAN_FRONTEND=noninteractive",
  "echo STAGE_APT_UPDATE",
  "retry apt-update sudo -n apt-get update -qq || { echo apt-update-failed >/tmp/arca-boot-failed; exit 11; }",
  "echo STAGE_APT_INSTALL",
  "retry apt-install sudo -n apt-get install -y -qq curl git ca-certificates unzip psmisc || { echo apt-install-failed >/tmp/arca-boot-failed; exit 12; }",
  'if ! command -v bun >/dev/null 2>&1; then echo STAGE_BUN; retry bun bash -c "curl -fsSL https://bun.sh/install | bash" || { echo bun-failed >/tmp/arca-boot-failed; exit 13; }; fi',
  'export PATH="$HOME/.bun/bin:$PATH"',
  "echo STAGE_CLONE",
  'rm -rf "$HOME/arca"',
  'retry clone git clone --depth 1 https://github.com/tamaa13/arca "$HOME/arca" || { echo clone-failed >/tmp/arca-boot-failed; exit 14; }',
  'cd "$HOME/arca" || { echo cd-failed >/tmp/arca-boot-failed; exit 16; }',
  "echo STAGE_INSTALL",
  "retry install bun install --production || { echo install-failed >/tmp/arca-boot-failed; exit 15; }",
  "echo STAGE_LAUNCH",
  "fuser -k 8080/tcp 2>/dev/null || true",
  "export ARCA_PORT=8080 ARCA_HOST=0.0.0.0 ARCA_RPC=https://evmrpc-testnet.0g.ai ARCA_INDEXER=https://indexer-storage-testnet-turbo.0g.ai ARCA_CHAIN_ID=16602 ARCA_REGISTRY_ADDR=0xc196C28886c93462f55A78134b5bF6118A3f5860",
  "nohup bun src/transport/http-server.ts > /tmp/arca-mcp.log 2>&1 &",
  "sleep 3",
  "echo BOOT_DONE > /tmp/arca-boot-done",
].join("\n");

try { await settlement.ensureFunded("0.2"); console.log("funded ✓ (ack/deposit idempotent)"); }
catch (e) { console.log("⚠ ensureFunded skipped (low operator wallet) — using existing deposit:", (e as Error).message.slice(0, 50)); }

let sb: { id: string; state: string } | undefined;
if (process.env.SANDBOX_ID) { sb = { id: process.env.SANDBOX_ID, state: "reused" }; console.log("reusing sandbox", sb.id); }
else for (let a = 1; a <= 8 && !sb; a++) {
  try { sb = await client.createSandbox({ snapshot: "daytonaio/sandbox:0.5.0-slim", sealed: false, name: "arca-unsealed" }); }
  catch (e) {
    const m = (e as Error).message;
    if (/acknowledg|402|503|orphan/i.test(m) && a < 8) { console.log(`create retry ${a} — ${m.slice(0, 50)}`); await sleep(5000); }
    else throw e;
  }
}
if (!sb) throw new Error("createSandbox failed");
const ep = buildSandboxEndpoint(sb.id);
console.log(`sandbox ${sb.id} (${sb.state}) → ${ep}`);

// Daytona exec TOKENIZES but runs no shell — wrap in `bash -c '...'` so pipes/
// redirects/`;`/`&` work; base64 the script so its own quotes don't clash with the
// single-quote wrapper (b64 is quote/space-free). (anima packages/gateway pattern.)
const b64 = Buffer.from(BOOT).toString("base64");
const launchRes = await client.exec(sb.id, `bash -c 'echo ${b64} | base64 -d > /tmp/arca-boot.sh; nohup bash /tmp/arca-boot.sh >/tmp/arca-launch.out 2>&1 & echo LAUNCHED'`, 60);
console.log("launch:", (launchRes.stdout || launchRes.result || "").trim(), "— bootstrap detached, ~3-6 min…");

let healthy = false;
for (let i = 0; i < 48; i++) {
  try { if ((await fetch(`${ep}/health`, { signal: AbortSignal.timeout(8000) })).ok) { healthy = true; break; } } catch {}
  if (i % 3 === 0) {
    try {
      const r = await client.exec(sb.id, "bash -c 'tail -n 2 /tmp/arca-boot.log 2>/dev/null; cat /tmp/arca-boot-failed 2>/dev/null'", 20);
      const o = (r.stdout || r.result || "").trim();
      if (o) console.log(`  [${i * 10}s] ${o.split("\n").pop()}`);
    } catch {}
  }
  await sleep(10000);
}

if (healthy) {
  console.log(`\n✅ Arca MCP LIVE (UNSEALED) on 0G Sandbox: ${ep}/mcp  — NOT operator-blind (exec-able); sealed needs 0G onboarding.`);
} else {
  console.log("\n⚠ not healthy — boot diagnostics:");
  try {
    const r = await client.exec(sb.id, "bash -c 'echo BOOTLOG:; tail -n 30 /tmp/arca-boot.log 2>/dev/null; echo MCPLOG:; tail -n 20 /tmp/arca-mcp.log 2>/dev/null; echo FAILED:; cat /tmp/arca-boot-failed 2>/dev/null'", 30);
    console.log(r.stdout || r.result || "(no diagnostics)");
  } catch (e) { console.log("diag exec err:", (e as Error).message); }
}
console.log("__SANDBOX_ID__", sb.id);
