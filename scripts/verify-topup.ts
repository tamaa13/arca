import { Wallet, JsonRpcProvider, Contract, formatEther } from "ethers";
import { SandboxClient } from "../src/sandbox/client.js";
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
const key = fs.readFileSync(path.join(os.homedir(), ".arca", "key"), "utf8").trim();
const p = new JsonRpcProvider("https://evmrpc-testnet.0g.ai", 16602);
const serving = new Contract("0xA07b0033cA65B06B090535944C121D8677FDC12c", ["function getBalance(address,address) view returns (uint256)"], p);
const F = "0xF308E88aaD991342A537CB47dc02440Cc2Da5Dd2", PROV = "0xB831371eb2703305f1d9F8542163633D0675CEd7";
const sleep = (ms:number) => new Promise(r=>setTimeout(r,ms));
const d0 = Number(formatEther(await serving.getBalance(F, PROV)));
console.log("deposit t0 :", d0.toFixed(6), "0G");
const client = new SandboxClient(new Wallet(key));
const sb:any = await client.getSandbox("99f8c291-0b42-49b4-ac10-94a46bf23315");
console.log("sandbox    :", sb.state, "| updatedAt:", sb.updatedAt, "| autoStop:", sb.autoStopInterval);
console.log("…waiting 75s (billing voucher interval = 60s)…");
await sleep(75000);
const d1 = Number(formatEther(await serving.getBalance(F, PROV)));
console.log("deposit t1 :", d1.toFixed(6), "0G");
const burned = d0 - d1;
console.log(burned > 0
  ? `✅ KEPAKE — deposit turun ${burned.toFixed(6)} 0G dalam 75s → runtime ACTIVE narik dari top-up (~${(burned/75*3600).toFixed(3)} 0G/hr)`
  : `⚠️ deposit TIDAK turun (${burned.toFixed(6)}) — billing belum narik / sandbox idle`);
