/**
 * 0G Sandbox settlement (Galileo). The current contract model splits responsibility:
 *   - SandboxServing (commercial: deposit / balance / refund) — addr from /api/info
 *   - TappRegistry  (TEE identity + user acknowledgement) — addr from serving.tappRegistry()
 * A user ACKNOWLEDGES the app's TEE once (`TappRegistry.acknowledgeApp(appId)`), then
 * DEPOSITS runtime (`SandboxServing.deposit`). The provider serves only after both.
 * Anima's April-2026 `acknowledgeTEESigner(provider,bool)` is obsolete — all addresses
 * + the appId are resolved live from the provider, so this survives further upgrades.
 */
import { Contract, JsonRpcProvider, Wallet, parseEther } from "ethers";
import { SandboxClient } from "./client.js";
import { SANDBOX, SANDBOX_SERVING_ABI } from "./constants.js";

const TESTNET_RPC = "https://evmrpc-testnet.0g.ai";
const SERVING_EXTRA = ["function tappRegistry() view returns (address)"] as const;
const TAPP_ABI = [
  "function acknowledgeApp(string appId)",
  "function isAcknowledged(address user, string appId) view returns (bool)",
  "function getAckCount(string appId) view returns (uint256)",
] as const;

export class SandboxSettlement {
  private readonly serving: Contract;
  private readonly tapp: Contract;
  readonly operator: string;
  readonly servingAddress: string;
  readonly tappAddress: string;
  readonly appId: string;

  private constructor(wallet: Wallet, servingAddr: string, tappAddr: string, appId: string) {
    this.operator = wallet.address;
    this.servingAddress = servingAddr;
    this.tappAddress = tappAddr;
    this.appId = appId;
    this.serving = new Contract(servingAddr, [...SANDBOX_SERVING_ABI, ...SERVING_EXTRA], wallet);
    this.tapp = new Contract(tappAddr, TAPP_ABI, wallet);
  }

  /** Resolve all live addresses (settlement, TappRegistry, appId) from the provider. */
  static async fromProvider(operatorKey: string, rpc: string = TESTNET_RPC): Promise<SandboxSettlement> {
    const wallet = new Wallet(operatorKey, new JsonRpcProvider(rpc, 16602));
    const client = new SandboxClient(new Wallet(operatorKey));
    const [info, provs] = await Promise.all([client.info(), client.providers()]);
    const appId = (provs[0] as { app_id: string }).app_id;
    const serving = new Contract(info.contract_address, SERVING_EXTRA, wallet);
    const tappAddr: string = await serving.tappRegistry();
    return new SandboxSettlement(wallet, info.contract_address, tappAddr, appId);
  }

  /** Runtime balance reserved against the provider (wei). */
  getBalance(): Promise<bigint> {
    return this.serving.getBalance(this.operator, SANDBOX.providerAddress);
  }

  /** Has the operator acknowledged the app's TEE? */
  isAcknowledged(): Promise<boolean> {
    return this.tapp.isAcknowledged(this.operator, this.appId);
  }

  /** Acknowledge the app's TEE once (TappRegistry). Required before the provider serves. */
  async acknowledge(): Promise<string> {
    const tx = await this.tapp.acknowledgeApp(this.appId);
    await tx.wait(1);
    return tx.hash;
  }

  /** Deposit `amountOg` 0G of runtime against the provider (SandboxServing). */
  async deposit(amountOg: string): Promise<string> {
    const tx = await this.serving.deposit(this.operator, SANDBOX.providerAddress, {
      value: parseEther(amountOg),
    });
    await tx.wait(1);
    return tx.hash;
  }

  /** Ensure acknowledged + at least `minOg` reserved. */
  async ensureFunded(minOg: string): Promise<{ acknowledged: string | null; deposited: string | null; balance: bigint }> {
    let acknowledged: string | null = null;
    if (!(await this.isAcknowledged())) acknowledged = await this.acknowledge();
    let deposited: string | null = null;
    if ((await this.getBalance()) < parseEther(minOg)) deposited = await this.deposit(minOg);
    return { acknowledged, deposited, balance: await this.getBalance() };
  }
}
