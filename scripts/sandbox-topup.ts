import { SandboxSettlement } from "../src/sandbox/settlement.js";
import { formatEther } from "ethers";
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
const key = fs.readFileSync(path.join(os.homedir(), ".arca", "key"), "utf8").trim();
const s = await SandboxSettlement.fromProvider(key);
console.log("depositing 1.5 0G to SandboxServing (provider runtime)…");
const r = await s.ensureFunded("1.5");
console.log("✓ deposit balance now:", formatEther(r.balance), "0G  (~", (Number(formatEther(r.balance))/0.09).toFixed(0), "hrs runtime)");
