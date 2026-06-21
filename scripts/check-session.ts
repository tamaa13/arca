import { JsonRpcProvider, Contract, formatEther } from "ethers";
const token = process.argv[2];
const base = "https://arca.alpaca-parrotfish.ts.net";
const r = await fetch(base + "/session", { headers: { Authorization: "Bearer " + token } });
if (!r.ok) { console.log("GET /session →", r.status, "→ token invalid/expired; re-sign di dashboard"); process.exit(1); }
const s: any = await r.json();
console.log("wallet  :", s.wallet);
console.log("signer  :", s.signerAddress);
console.log("registry:", s.registry, "| chain", s.chainId);
const p = new JsonRpcProvider("https://evmrpc-testnet.0g.ai");
const bal = await p.getBalance(s.signerAddress);
const reg = new Contract(s.registry, ["function isDelegate(address,address) view returns (bool)"], p);
const isDel = await reg.isDelegate(s.wallet, s.signerAddress);
console.log("balance :", formatEther(bal), "0G", bal > 0n ? "✓ funded" : "✗ BELUM deposit");
console.log("delegate:", isDel ? "✓ authorized" : "✗ BELUM authorize (setDelegate)");
console.log(bal > 0n && isDel ? "\n✅ READY TO TEST" : "\n⚠️ selesaiin step Deposit + Authorize di dashboard dulu");
