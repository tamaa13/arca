// Connected-agents management — client side.
//
// The wallet signs an EIP-191 readable-text message to add/revoke a connector. This message
// MUST be byte-for-byte identical to the server's src/auth/connectors.ts `connectorMgmtMessage`
// (the server recovers the signer from it) — keep the two in lockstep. It is DOMAIN-SEPARATED
// from the EIP-712 key-deriving message (different scheme + prefix), so a management signature
// can never be replayed to derive the memory key.

import { getAddress } from "ethers";

export interface ConnectorListing {
  id: string; // opaque (sha256) id — safe to show; used to revoke
  label: string;
  kind: "cli" | "oauth";
  createdAt: number; // unix s
  expiresAt: number; // unix s; 0 = never
  revoked: boolean;
}

/** EXACT mirror of the server's connectorMgmtMessage — the signature is recovered against it. */
export function connectorMgmtMessage(opts: {
  action: "add" | "revoke" | "revoke-all";
  wallet: string;
  label?: string;
  connectorId?: string;
  issuedAt: number; // ms
}): string {
  const lines = [`Arca: ${opts.action} connector`, "", `vault: ${getAddress(opts.wallet)}`];
  if (opts.action === "add") lines.push(`label: ${opts.label ?? ""}`);
  else if (opts.action === "revoke") lines.push(`connector: ${opts.connectorId ?? ""}`);
  lines.push(`issued: ${opts.issuedAt}`);
  return lines.join("\n");
}
