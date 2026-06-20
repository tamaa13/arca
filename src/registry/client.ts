/**
 * On-chain memory registry client — anchors 0G Storage root hashes on 0G Chain.
 *
 * Implements the `MemoryRegistry` contract from ../types.js:
 *   addRoot(rootHash)  -> sends a tx to ArcaRegistry, waits 1 conf
 *   getRoots(user)     -> view call, returns the user's anchored root hashes (hex)
 *
 * Why this exists: each encrypted memory blob lives on 0G Storage under a 32-byte
 * root hash. Anchoring those roots on 0G Chain (Aristotle, chainId 16661) keyed by
 * the user's address means the memory list is recoverable from the key alone on any
 * machine — the local index (~/.arca/index.json) becomes optional, and the list is
 * un-ruggable. It also makes 0G Chain explicitly load-bearing (our own contract).
 *
 * Contract: contracts/src/ArcaRegistry.sol (deploy with contracts/script/Deploy.s.sol).
 */

import { JsonRpcProvider, Wallet, Contract } from "ethers";
import { OG, type MemoryRegistry } from "../types.js";

/** Minimal ABI — only the methods this client uses. */
const ARCA_REGISTRY_ABI = [
  "function addRoot(bytes32 root) external",
  "function addRoots(bytes32[] calldata roots) external",
  "function getRoots(address user) external view returns (bytes32[])",
  "function rootCount(address user) external view returns (uint256)",
] as const;

/** Normalize a root hash to a 0x-prefixed 32-byte (66-char) hex string. */
function toBytes32(rootHash: string): string {
  const hex = rootHash.startsWith("0x") ? rootHash : `0x${rootHash}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error(
      `ArcaRegistry: rootHash must be a 32-byte hex string (got "${rootHash}")`,
    );
  }
  return hex.toLowerCase();
}

/**
 * TS client for the ArcaRegistry contract on 0G Chain (mainnet 16661).
 *
 * @example
 *   const reg = new RegistryClient(privKeyHex);   // uses OG.registry
 *   await reg.addRoot("0xabc…");                   // anchor on chain
 *   const roots = await reg.getRoots(myAddress);   // recover the list
 */
export class RegistryClient implements MemoryRegistry {
  private readonly contract: Contract;
  /** The deployed ArcaRegistry address this client talks to. */
  readonly address: string;

  /**
   * @param privKeyHex      The user's secp256k1 private key (signs addRoot txs).
   * @param contractAddress ArcaRegistry address. Defaults to `OG.registry`
   *                        (env ARCA_REGISTRY_ADDR). Throws if both are empty.
   */
  constructor(privKeyHex: string, contractAddress: string = OG.registry) {
    if (!contractAddress) {
      throw new Error(
        "ArcaRegistry not deployed — set ARCA_REGISTRY_ADDR to the deployed " +
          "registry address (or pass contractAddress). Deploy with " +
          "contracts/script/Deploy.s.sol (see contracts/README.md).",
      );
    }
    this.address = contractAddress;

    const provider = new JsonRpcProvider(OG.rpc, OG.chainId);
    const wallet = new Wallet(privKeyHex, provider);
    this.contract = new Contract(contractAddress, ARCA_REGISTRY_ABI, wallet);
  }

  /** Anchor a single memory root on 0G Chain for the caller. Waits 1 conf. */
  async addRoot(rootHash: string): Promise<void> {
    const tx = await this.contract.addRoot(toBytes32(rootHash));
    await tx.wait(1);
  }

  /** Anchor a batch of memory roots in one tx. Waits 1 conf. */
  async addRoots(rootHashes: string[]): Promise<void> {
    const tx = await this.contract.addRoots(rootHashes.map(toBytes32));
    await tx.wait(1);
  }

  /** Recover all anchored memory roots for a user (view call). Returns 0x hex. */
  async getRoots(user: string): Promise<string[]> {
    const roots: string[] = await this.contract.getRoots(user);
    return roots.map((r) => r.toLowerCase());
  }
}
