// Connected-agents — shared types. The dashboard manages connectors with the live session
// bearer (no extra wallet signature while signed in), so the EIP-191 management-message builder
// lives only on the server now (src/auth/connectors.ts), used for the cross-device fallback path.

export interface ConnectorListing {
  id: string; // opaque (sha256) id — safe to show; used to revoke
  label: string;
  kind: "cli" | "oauth";
  createdAt: number; // unix s
  expiresAt: number; // unix s; 0 = never
  revoked: boolean;
}
