import { JsonRpcProvider, Contract } from "ethers";
const p = new JsonRpcProvider("https://evmrpc-testnet.0g.ai", 16602);
const reg = new Contract("0xc196C28886c93462f55A78134b5bF6118A3f5860", ["function rootCount(address) view returns (uint256)"], p);
const n = await reg.rootCount("0x1d4D51F08ab86985533Da9D574A3df68336c485D");
console.log("rootCount(485d):", Number(n), "→ panel 'Memories saved' = angka ini (getRoots tadi = 5)");
