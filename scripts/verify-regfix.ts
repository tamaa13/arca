import { RegistryClient } from "../src/registry/client.js";
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
const key = fs.readFileSync(path.join(os.homedir(), ".arca", "key"), "utf8").trim();
const V2 = "0xc196C28886c93462f55A78134b5bF6118A3f5860";
const W485 = "0x1d4D51F08ab86985533Da9D574A3df68336c485D"; // has memories on TESTNET 0xc196
// BUGGY (old behavior): no explicit network → provider = OG defaults = MAINNET (no env set)
let buggy: number | string;
try { buggy = (await new RegistryClient(key, V2).getRoots(W485)).length; }
catch (e) { buggy = "ERR(" + (e as Error).message.slice(0, 30) + ")"; }
// FIXED: explicit testnet rpc + chainId
const fixed = (await new RegistryClient(key, V2, "https://evmrpc-testnet.0g.ai", 16602).getRoots(W485)).length;
console.log("485d roots — BUGGY (OG default→mainnet):", buggy, "| FIXED (explicit testnet):", fixed);
console.log(fixed > 0 && buggy !== fixed ? "✅ FIX WORKS — explicit network hits TESTNET (real roots); the old path went to the wrong chain" : "⚠ inconclusive");
