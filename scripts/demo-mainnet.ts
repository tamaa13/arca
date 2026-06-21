/**
 * Arca MAINNET demo — full save→recall on 0G Aristotle (16661) with the funded demo wallet.
 * Proves the switch end-to-end: session → deposit → delegate → save (mainnet storage + registry)
 * → cross-agent recall. Run:
 *   ARCA_RPC=https://evmrpc.0g.ai ARCA_CHAIN_ID=16661 \
 *   ARCA_INDEXER=https://indexer-storage-turbo.0g.ai \
 *   ARCA_REGISTRY_ADDR=0xbf9751705b347fe21A5171Ebf2b0d00e1D91a540 \
 *   DEMO_KEY_FILE=/tmp/arca-demo.key bun scripts/demo-mainnet.ts
 */
import fs from "node:fs";
import { JsonRpcProvider, Wallet, parseEther, formatEther } from "ethers";
import { OgStorageClient } from "../src/og/storage.js";
import { RegistryClient } from "../src/registry/client.js";
import { RemoteMemoryStore } from "../src/memory/remote-store.js";
import { keyedCrypto, ARCA_KEY_DOMAIN, ARCA_KEY_TYPES, arcaKeyMessage } from "../src/wallet/sig-key.js";
import { createSession } from "../src/auth/sessions.js";

const RPC = process.env.ARCA_RPC ?? "https://evmrpc.0g.ai";
const CHAIN = Number(process.env.ARCA_CHAIN_ID ?? 16661);
const V2 = process.env.ARCA_REGISTRY_ADDR ?? "0xbf9751705b347fe21A5171Ebf2b0d00e1D91a540";
const provider = new JsonRpcProvider(RPC, CHAIN);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const walletKey = fs.readFileSync(process.env.DEMO_KEY_FILE ?? "/tmp/arca-demo.key", "utf8").trim();
const wallet = new Wallet(walletKey, provider);
console.log("=== Arca MAINNET demo ===");
console.log("owner wallet:", wallet.address, "| chain", CHAIN, "| registry", V2);
console.log("balance:", formatEther(await provider.getBalance(wallet.address)), "OG");

// 1. session (memory key + minted session-signer + token) — same as the server does
const sig = await wallet.signTypedData(ARCA_KEY_DOMAIN, ARCA_KEY_TYPES, arcaKeyMessage());
const session = await createSession(wallet.address, sig);
console.log("✓ session | signer:", session.signerAddress);

// 2. deposit gas to the signer
await (await wallet.sendTransaction({ to: session.signerAddress, value: parseEther("0.06"), gasPrice: 5_000_000_000n })).wait(1);
console.log("✓ deposited 0.06 OG → signer");

// 3. authorize the signer as a v2-registry delegate
await new RegistryClient(walletKey, V2).setDelegate(session.signerAddress, true);
console.log("✓ wallet.setDelegate(signer)");

const makeStore = () => new RemoteMemoryStore(
  new OgStorageClient(session.signerKey),
  keyedCrypto(session.memoryKey),
  new RegistryClient(session.signerKey, V2),
  wallet.address,
);

// 4. agent A: save (block on finalization)
const marker = `arca-mainnet-demo ${Date.now()}`;
const rec = await makeStore().save(marker, { blockUpload: true });
console.log("✓ saved + finalized on MAINNET:", rec.id, "| root:", rec.rootHash?.slice(0, 14) + "…");

// 5. agent B: fresh store recalls registry-only (cross-agent / cross-device)
let found = "";
for (let i = 0; i < 8; i++) {
  const hits = await makeStore().recall("arca-mainnet-demo");
  const hit = hits.find((r) => r.text === marker);
  if (hit) { found = hit.text; console.log(`✓ agent B recall (try ${i + 1}): FOUND`); break; }
  console.log(`  recall try ${i + 1}: not retrievable yet…`);
  await sleep(5000);
}
console.log(found
  ? `\n✅ MAINNET PASS — wallet-keyed, delegate-anchored, cross-agent recall on 0G Aristotle:\n   "${found}"`
  : "\n❌ FAIL — blob did not finalize (mainnet storage may be stalling — main warned)");
process.exit(found ? 0 : 1);
