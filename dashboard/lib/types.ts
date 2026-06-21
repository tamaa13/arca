// Shared session / connector types — mirror the server's GET/POST /session responses.

export interface SessionData {
  token: string;
  wallet?: string; // present on GET /session
  connectorUrl: string;
  signerAddress: string;
  registry: string;
  chainId: number;
  // POST /session also returns `next` (a human hint) — not used by the UI.
  next?: string;
}

export interface HandoffEnvelope {
  ephPubkeyHex: string;
  ivHex: string;
  tagHex: string;
  ciphertextHex: string;
}

export type StepStatus = "idle" | "on" | "done";
export type StatusKind = "" | "ok" | "err";

export interface StatusMessage {
  text: string;
  kind: StatusKind;
}
