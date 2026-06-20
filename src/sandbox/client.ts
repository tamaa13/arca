/**
 * 0G Sandbox provider client (ported from anima's `og-sandbox`, viem → ethers).
 *
 * Auth: every write/read-private request carries three EIP-191 signed headers built
 * from a canonical SignedRequest (action, expires_at, nonce, payload, resource_id).
 * Public reads (info, providers, snapshots) need no auth. Each retry re-signs (fresh
 * nonce + expiry) because the provider rejects nonce reuse / stale expiries.
 */
import { randomBytes } from "node:crypto";
import { Wallet } from "ethers";
import { SANDBOX } from "./constants.js";

export interface SandboxResources {
  cpu?: number;
  memory?: number;
  disk?: number;
  class?: "small" | "medium" | "large";
}
export interface CreateSandboxBody {
  snapshot?: string;
  image?: string;
  name?: string;
  sealed?: boolean;
  env?: Record<string, string>;
  resources?: SandboxResources;
}
export interface SandboxRecord {
  id: string;
  state: string;
  name?: string;
  imageName?: string;
  cpu?: number;
  mem?: number;
  disk?: number;
}
export interface ExecResponse {
  exitCode: number;
  result?: string;
  stdout?: string;
  stderr?: string;
}
/** `/api/info` — authoritative current provider config (the settlement contract upgrades). */
export interface ProviderApiInfo {
  chain_id: number;
  contract_address: string;
  provider_address: string;
  create_fee: string;
  min_balance: string;
  rpc_url: string;
}

type Headers = Record<string, string>;
const RETRYABLE = new Set([502, 503, 504]);

function signRequest(
  wallet: Wallet,
  opts: { action: string; payload?: Record<string, unknown>; resourceId?: string },
): Promise<Headers> {
  const req = {
    action: opts.action,
    expires_at: Math.floor(Date.now() / 1000) + 300,
    nonce: randomBytes(16).toString("hex"),
    payload: opts.payload ?? {},
    resource_id: opts.resourceId ?? "",
  };
  const json = JSON.stringify(req);
  return wallet.signMessage(json).then((signature) => ({
    "X-Wallet-Address": wallet.address,
    "X-Signed-Message": Buffer.from(json, "utf8").toString("base64"),
    "X-Wallet-Signature": signature,
  }));
}

export class SandboxClient {
  private readonly endpoint: string;
  constructor(
    private readonly wallet: Wallet,
    endpoint: string = SANDBOX.providerUrl,
    private readonly retries = 3,
  ) {
    this.endpoint = endpoint.replace(/\/$/, "");
  }

  private async fetchRetry(
    path: string,
    build: () => Promise<RequestInit | undefined> | RequestInit | undefined,
    timeoutMs: number,
  ): Promise<Response> {
    let lastErr: unknown;
    let lastRes: Response | null = null;
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      try {
        const init = await build();
        const res = await fetch(`${this.endpoint}${path}`, { ...init, signal: AbortSignal.timeout(timeoutMs) });
        if (!RETRYABLE.has(res.status)) return res;
        lastRes = res;
        lastErr = new Error(`${path}: ${res.status} (retryable)`);
      } catch (e) {
        lastErr = e;
      }
      if (attempt < this.retries) await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    }
    if (lastRes) return lastRes;
    throw lastErr;
  }

  private async getPublic<T>(path: string): Promise<T> {
    const r = await this.fetchRetry(path, () => undefined, 30_000);
    if (!r.ok) throw new Error(`GET ${path}: ${r.status}`);
    return (await r.json()) as T;
  }

  private async signed<T>(
    method: "GET" | "POST" | "DELETE",
    path: string,
    action: string,
    opts: { body?: unknown; resourceId?: string } = {},
  ): Promise<T> {
    const r = await this.fetchRetry(
      path,
      async () => ({
        method,
        headers: {
          ...(await signRequest(this.wallet, {
            action,
            resourceId: opts.resourceId,
            payload: opts.body as Record<string, unknown> | undefined,
          })),
          ...(opts.body !== undefined ? { "content-type": "application/json" } : {}),
        },
        ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
      }),
      method === "GET" ? 30_000 : 60_000,
    );
    if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${await r.text().catch(() => "")}`);
    const text = await r.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  // public reads
  info(): Promise<ProviderApiInfo> { return this.getPublic("/api/info"); }
  providers(): Promise<unknown[]> { return this.getPublic("/api/providers"); }
  snapshots(): Promise<unknown[]> { return this.getPublic("/api/snapshots"); }

  // signed
  createSandbox(body: CreateSandboxBody): Promise<SandboxRecord> {
    return this.signed("POST", "/api/sandbox", "create", { body });
  }
  getSandbox(id: string): Promise<SandboxRecord> {
    return this.signed("GET", `/api/sandbox/${encodeURIComponent(id)}`, "list", { resourceId: id });
  }
  listSandboxes(): Promise<SandboxRecord[]> {
    return this.signed("GET", "/api/sandbox", "list");
  }
  deleteSandbox(id: string): Promise<void> {
    return this.signed("DELETE", `/api/sandbox/${encodeURIComponent(id)}`, "delete", { resourceId: id });
  }
  exec(id: string, command: string, timeout = 120): Promise<ExecResponse> {
    return this.signed("POST", `/api/toolbox/${encodeURIComponent(id)}/toolbox/process/execute`, "toolbox", {
      resourceId: id,
      body: { command, timeout },
    });
  }
}
