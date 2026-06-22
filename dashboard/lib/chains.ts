import { defineChain } from "viem";

// 0G networks for wagmi/RainbowKit. Testnet is where Arca's v2 contracts live today;
// mainnet is offered so users can connect/switch (functional path runs on testnet until
// the v2 registry is deployed to mainnet).
export const zgTestnet = defineChain({
  id: 16602,
  name: "0G Galileo Testnet",
  nativeCurrency: { name: "0G", symbol: "0G", decimals: 18 },
  rpcUrls: { default: { http: ["https://evmrpc-testnet.0g.ai"] } },
  blockExplorers: { default: { name: "0G Scan", url: "https://chainscan-galileo.0g.ai" } },
  testnet: true,
});

export const zgMainnet = defineChain({
  id: 16661,
  name: "0G Aristotle",
  nativeCurrency: { name: "0G", symbol: "0G", decimals: 18 },
  rpcUrls: { default: { http: ["https://evmrpc.0g.ai"] } },
  blockExplorers: { default: { name: "0G Scan", url: "https://chainscan.0g.ai" } },
});

// The chain Arca's app logic targets (registry reads/writes) — testnet for now.
export const APP_CHAIN = zgTestnet;
