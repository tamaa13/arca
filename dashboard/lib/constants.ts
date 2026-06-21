// Network + EIP-712 constants — MUST match src/wallet/sig-key.ts and the server.
// 0G Galileo testnet (chainId 16602).

export const GALILEO = {
  chainIdHex: "0x40DA", // 16602
  params: {
    chainId: "0x40DA",
    chainName: "0G Galileo Testnet",
    nativeCurrency: { name: "0G", symbol: "0G", decimals: 18 },
    rpcUrls: ["https://evmrpc-testnet.0g.ai"],
    blockExplorerUrls: ["https://chainscan-galileo.0g.ai"],
  },
} as const;

// EIP-712 — MUST match src/wallet/sig-key.ts (domain = name+version only, no chainId).
// Typed (not `as const`) so the arrays stay mutable for ethers' TypedDataField[] params.
import type { TypedDataDomain, TypedDataField } from "ethers";

export const DOMAIN: TypedDataDomain = { name: "Arca", version: "1" };
export const TYPES: Record<string, TypedDataField[]> = {
  ArcaKey: [
    { name: "purpose", type: "string" },
    { name: "scope", type: "string" },
  ],
};
export const MESSAGE: Record<string, string> = {
  purpose: "Derive your Arca memory encryption key.",
  scope: "memory-v1",
};

// localStorage key for the cached session.
export const LS_KEY = "arca_session_v1";

// Registry ABIs (read + write). Plain string[] for ethers Contract.
export const REGISTRY_IS_DELEGATE_ABI: string[] = [
  "function isDelegate(address,address) view returns (bool)",
];
export const REGISTRY_SET_DELEGATE_ABI: string[] = [
  "function setDelegate(address delegate, bool authorized) external",
];
export const REGISTRY_ROOT_COUNT_ABI: string[] = [
  "function rootCount(address user) view returns (uint256)",
];

// Block explorer for the active network — signer activity / usage-history links.
export const EXPLORER = GALILEO.params.blockExplorerUrls[0];

export type Platform = "claude" | "cursor" | "opencode" | "codex" | "antigravity" | "web" | "other";
export const PLATFORMS: Platform[] = ["claude", "cursor", "opencode", "codex", "antigravity", "web", "other"];
