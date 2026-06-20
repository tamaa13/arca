/** ArcaRegistry v2 owner-mapping + delegation proof (testnet).
 *  Owner authorizes a delegate (session-signer); the delegate anchors a root UNDER
 *  the owner; the root is recovered by the OWNER's address (cross-device); a
 *  non-delegate is blocked. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Contract, JsonRpcProvider, Wallet, parseEther } from "ethers";
import { RegistryClient } from "../src/registry/client.js";

const V2 = process.env.ARCA_REGISTRY_ADDR ?? "0xc196C28886c93462f55A78134b5bF6118A3f5860";
const provider = new JsonRpcProvider("https://evmrpc-testnet.0g.ai", 16602);

const ownerKey = fs.readFileSync(path.join(os.homedir(), ".arca", "key"), "utf8").trim();
const owner = new Wallet(ownerKey, provider);
const delegate = Wallet.createRandom().connect(provider);
console.log("owner (wallet)   :", owner.address);
console.log("delegate (signer):", delegate.address);
console.log("registry v2      :", V2);

// Fund the delegate so it can pay gas to anchor.
const ft = await owner.sendTransaction({
  to: delegate.address,
  value: parseEther("0.05"),
  gasPrice: 5_000_000_000n,
});
await ft.wait(1);
console.log("✓ funded delegate 0.05 OG");

// 1. Owner authorizes the delegate.
await new RegistryClient(ownerKey, V2).setDelegate(delegate.address, true);
console.log("✓ owner.setDelegate(delegate, true)");

// 2. Delegate anchors a root UNDER the owner.
const root = `0x${"ab".repeat(32)}`;
await new RegistryClient(delegate.privateKey, V2).addRootFor(owner.address, root);
console.log("✓ delegate.addRootFor(owner, root)");

// 3. Recover by the OWNER's address (this is what cross-device recall does).
const roots = await new RegistryClient(ownerKey, V2).getRoots(owner.address);
const found = roots.map((r) => r.toLowerCase()).includes(root.toLowerCase());
console.log("getRoots(owner) includes the delegated root:", found);

// 4. A non-delegate cannot anchor for the owner (static call reverts).
const stranger = Wallet.createRandom().connect(provider);
let blocked = false;
try {
  await new Contract(V2, ["function addRootFor(address,bytes32)"], stranger).addRootFor.staticCall(
    owner.address,
    `0x${"cd".repeat(32)}`,
  );
} catch {
  blocked = true;
}
console.log("non-delegate blocked:", blocked);

const pass = found && blocked;
console.log(
  pass
    ? "\n✅ owner-mapping + delegation PASS — roots keyed by the WALLET, only authorized delegates anchor"
    : "\n❌ FAIL",
);
process.exit(pass ? 0 : 1);
