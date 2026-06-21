import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { JsonRpcProvider, Wallet, parseEther, formatEther } from "ethers";

// 1. resolve full 485d address from main's mainnet funding tx (485d -> demo wallet)
const mainnet = new JsonRpcProvider("https://evmrpc.0g.ai", 16661);
const ft = await mainnet.getTransaction("0x5ebb3ad97727798018a894921dabe410af15b3c8d96bfe91e13dc48d0213f4df");
if (!ft) throw new Error("funding tx not found");
const broker485d = ft.from;
console.log("485d (broker EOA):", broker485d);
if (!broker485d.toLowerCase().endsWith("485d")) console.log("⚠️ address doesn't end 485d — double-check");

// 2. testnet: send from ~/.arca/key
const testnet = new JsonRpcProvider("https://evmrpc-testnet.0g.ai", 16602);
const key = fs.readFileSync(path.join(os.homedir(), ".arca", "key"), "utf8").trim();
const w = new Wallet(key, testnet);
const bal = await testnet.getBalance(w.address);
console.log("sender ~/.arca/key:", w.address, "| testnet balance:", formatEther(bal), "OG");
console.log("485d testnet balance BEFORE:", formatEther(await testnet.getBalance(broker485d)), "OG");

let amt = parseEther("2");
if (bal < amt + parseEther("0.1")) amt = bal - parseEther("0.1");   // leave gas
if (amt <= 0n) throw new Error("sender has insufficient testnet 0G");
console.log("sending", formatEther(amt), "OG -> 485d…");
const tx = await w.sendTransaction({ to: broker485d, value: amt, gasPrice: 5_000_000_000n });
console.log("tx:", tx.hash);
await tx.wait(1);
console.log("✓ confirmed. 485d testnet balance AFTER:", formatEther(await testnet.getBalance(broker485d)), "OG");
