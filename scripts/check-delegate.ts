import { JsonRpcProvider, Contract } from "ethers";
const p = new JsonRpcProvider("https://evmrpc-testnet.0g.ai", 16602);
const reg = new Contract("0xc196C28886c93462f55A78134b5bF6118A3f5860", ["function isDelegate(address,address) view returns (bool)"], p);
const owner = "0xF308E88aaD991342A537CB47dc02440Cc2Da5Dd2", signer = "0xC5f989C8163D44D57ff185C216B9B46772d507F9";
console.log("isDelegate[owner][signer] NOW:", await reg.isDelegate(owner, signer));
