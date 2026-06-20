/**
 * Per-user remote engine — full flow on testnet (the "all features work" proof).
 *
 * Simulates everything the dashboard + hosted MCP do, end to end:
 *   1. user signs the Arca EIP-712 → createSession (derives memory key + mints a
 *      session-signer + issues a bearer token)
 *   2. DEPOSIT: the wallet funds the session-signer with testnet 0G
 *   3. AUTHORIZE: the wallet registers the signer as a v2-registry delegate
 *   4. agent A: save() — encrypted to the wallet key, anchored UNDER the wallet by
 *      the delegate, gas paid by the (deposited) signer
 *   5. agent B (a FRESH store instance, no shared state): recall() — registry-only,
 *      getRoots(wallet) → getBlob → decrypt → match. This is the cross-agent /
 *      cross-device guarantee.
 *
 * Run: ARCA_RPC=…testnet ARCA_CHAIN_ID=16602 ARCA_REGISTRY_ADDR=0xc196… \
 *      npx tsx scripts/test-remote-e2e.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { JsonRpcProvider, Wallet, parseEther } from "ethers";
import { OgStorageClient } from "../src/og/storage.js";
import { RegistryClient } from "../src/registry/client.js";
import { RemoteMemoryStore } from "../src/memory/remote-store.js";
import { keyedCrypto, ARCA_KEY_DOMAIN, ARCA_KEY_TYPES, arcaKeyMessage } from "../src/wallet/sig-key.js";
import { createSession } from "../src/auth/sessions.js";

const V2 = process.env.ARCA_REGISTRY_ADDR ?? "0xc196C28886c93462f55A78134b5bF6118A3f5860";
const provider = new JsonRpcProvider("https://evmrpc-testnet.0g.ai", 16602);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// The "wallet" = the funded testnet key (it has gas for the deposit + setDelegate).
const walletKey = fs.readFileSync(path.join(os.homedir(), ".arca", "key"), "utf8").trim();
const wallet = new Wallet(walletKey, provider);
console.log("user wallet (owner):", wallet.address);

// 1. user signs the Arca EIP-712 → server creates the session.
const sig = await wallet.signTypedData(ARCA_KEY_DOMAIN, ARCA_KEY_TYPES, arcaKeyMessage());
const session = await createSession(wallet.address, sig);
console.log("✓ session:", session.token.slice(0, 18) + "…", "| signer:", session.signerAddress);

// 2. DEPOSIT — fund the session-signer so it can pay 0G gas + storage.
await (await wallet.sendTransaction({
  to: session.signerAddress,
  value: parseEther("0.06"),
  gasPrice: 5_000_000_000n,
})).wait(1);
console.log("✓ deposited 0.06 OG to the session-signer");

// 3. AUTHORIZE — wallet registers the signer as a v2-registry delegate.
await new RegistryClient(walletKey, V2).setDelegate(session.signerAddress, true);
console.log("✓ wallet.setDelegate(signer)");

// build the per-user store (gas = signer, key = wallet sig, owner = wallet, registry v2).
const makeStore = () =>
  new RemoteMemoryStore(
    new OgStorageClient(session.signerKey),
    keyedCrypto(session.memoryKey),
    new RegistryClient(session.signerKey, V2),
    wallet.address,
  );

// 4. agent A: save (block on finalization so the test is deterministic + surfaces errors).
const marker = `remote-e2e ${Date.now()}`;
const rec = await makeStore().save(marker, { blockUpload: true });
console.log("✓ agent A saved + finalized:", rec.id, "| root:", rec.rootHash?.slice(0, 12) + "…");

// 5. agent B: a FRESH store instance recalls registry-only (cross-agent / cross-device).
let found = "";
for (let i = 0; i < 6; i++) {
  const hits = await makeStore().recall("remote-e2e");
  const hit = hits.find((r) => r.text === marker);
  if (hit) { found = hit.text; console.log(`✓ agent B recall (try ${i + 1}): found`); break; }
  console.log(`  recall try ${i + 1}: not retrievable yet…`);
  await sleep(5000);
}

console.log(
  found
    ? `\n✅ PER-USER REMOTE ENGINE PASS — wallet-keyed, delegate-anchored, deposit-funded, cross-agent recall:\n   "${found}"`
    : "\n❌ FAIL — blob did not finalize in time",
);
process.exit(found ? 0 : 1);
