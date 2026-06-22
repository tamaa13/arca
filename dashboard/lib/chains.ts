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

// The single chain this deployment runs on — auto-detected from the build env so the dashboard
// matches whatever network the server serves. Testnet today; set NEXT_PUBLIC_ARCA_CHAIN_ID=16661
// when the server migrates to mainnet and the dashboard follows automatically. Users never pick a
// network — they connect on this one (RainbowKit prompts a switch if their wallet is elsewhere).
const CONFIGURED_CHAIN_ID = Number(process.env.NEXT_PUBLIC_ARCA_CHAIN_ID ?? "16602");
export const APP_CHAIN = CONFIGURED_CHAIN_ID === zgMainnet.id ? zgMainnet : zgTestnet;
