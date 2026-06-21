import { Wallet, JsonRpcProvider, Contract, formatEther } from "ethers";
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
const kp = path.join(os.homedir(), ".arca", "key");
if (!fs.existsSync(kp)) { console.log("NO ~/.arca/key"); process.exit(1); }
const key = fs.readFileSync(kp, "utf8").trim();
const p = new JsonRpcProvider("https://evmrpc-testnet.0g.ai", 16602);
const w = new Wallet(key, p);
console.log("operator wallet :", w.address);
console.log("wallet balance  :", formatEther(await p.getBalance(w.address)), "0G");
const serving = new Contract("0xA07b0033cA65B06B090535944C121D8677FDC12c", ["function getBalance(address,address) view returns (uint256)"], p);
try {
  const dep = await serving.getBalance(w.address, "0xB831371eb2703305f1d9F8542163633D0675CEd7");
  console.log("deposit balance :", formatEther(dep), "0G  (need ~0.2 for deploy)");
} catch(e:any){ console.log("deposit read err:", e.message.slice(0,60)); }
