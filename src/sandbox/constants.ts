/**
 * 0G Sandbox (TDX TEE container) — Galileo testnet constants.
 *
 * 0G Sandbox is 0G's own confidential-container service (Daytona-backed, EIP-191
 * wallet-auth, on-chain settlement). It is the 0G-NATIVE answer to "operator-blind
 * hosting" — what anima uses (`anima deploy --target sandbox`), NOT Phala. Currently
 * Galileo-testnet-only; mainnet is a hybrid (assets on mainnet, container on Galileo)
 * until 0G launches Sandbox on mainnet. Source: github.com/0gfoundation/0g-sandbox.
 */
export const SANDBOX = {
  /** Provider proxy base URL (Galileo). */
  providerUrl: "https://provider-private-sandbox-testnet.0g.ai",
  /** Provider wallet (deposits are made against this). */
  providerAddress: "0xB831371eb2703305f1d9F8542163633D0675CEd7",
  /** SandboxServing settlement contract (Galileo). The provider UPGRADES this —
   *  the authoritative current address is `/api/info`.contract_address. As of
   *  2026-06-21 it is 0xA07b… (anima's April-2026 0xd7e0… is stale). Always prefer
   *  the live value via SandboxSettlement.fromProvider(). */
  settlement: "0xA07b0033cA65B06B090535944C121D8677FDC12c",
  /** Inbound reverse-proxy host: http://<port>-<sandboxId>.<host>. */
  nipHost: "43.106.147.28.nip.io:4000",
  /** A small base snapshot (1 CPU / 1 GB / 3 GB disk). */
  defaultSnapshot: "ubuntu22",
  /** One-time create fee (0.06 0G) — keep enough balance above the runtime burn. */
  createFeeOg: "0.06",
} as const;

/** Minimal SandboxServing ABI (the functions Arca's deploy/billing flow uses). */
export const SANDBOX_SERVING_ABI = [
  "function deposit(address recipient, address provider) payable",
  "function acknowledgeTEESigner(address provider, bool acknowledged)",
  "function getBalance(address user, address provider) view returns (uint256)",
  "function isTEEAcknowledged(address user, address provider) view returns (bool)",
  "function requestRefund(address provider, uint256 amount)",
  "function withdrawRefund(address provider)",
] as const;

/** Full inbound URL for an HTTP server bound inside a sandbox (default port 8080). */
export function buildSandboxEndpoint(sandboxId: string, port = 8080): string {
  return `http://${port}-${sandboxId}.${SANDBOX.nipHost}`;
}
