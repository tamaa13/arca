/** One-off: send mainnet 0G between the user's own wallets. Source key = arg, or key.funded.bak (0xea7b).
 *  usage: npx tsx scripts/xfer.ts <toAddress> <amountOG> */
import { ethers } from "ethers";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const srcKey = fs
  .readFileSync(path.join(os.homedir(), ".arca", "key.funded.bak"), "utf8")
  .trim();
const to = process.argv[2];
const amount = process.argv[3] ?? "0.3";
if (!to) throw new Error("usage: xfer.ts <toAddress> <amountOG>");

const provider = new ethers.JsonRpcProvider("https://evmrpc.0g.ai");
const wallet = new ethers.Wallet(srcKey, provider);
console.log("from:", wallet.address, "(0xea7b funded)");
console.log("to  :", to);
console.log("amt :", amount, "OG (mainnet 16661)");
const bal = await provider.getBalance(wallet.address);
console.log("from balance before:", ethers.formatEther(bal), "OG");

const tx = await wallet.sendTransaction({ to, value: ethers.parseEther(amount) });
console.log("tx:", tx.hash, "— waiting 1 conf…");
await tx.wait(1);
const newBal = await provider.getBalance(to);
console.log("✓ done — target mainnet balance:", ethers.formatEther(newBal), "OG");
