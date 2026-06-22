/**
 * E2E live setup for wallet 485d: create a session, fund + authorize the signer (idempotent —
 * skips whatever's already done on-chain), and mint two per-agent connector tokens via the
 * session bearer (the new Tier-2 path). Writes the tokens to /tmp/arca-e2e-tokens.json (chmod600).
 *
 * PK is taken from $E2E_PK (never hard-coded / logged). Run:
 *   E2E_PK=0x... bun scripts/e2e-485d-setup.ts
 */
import { Wallet, JsonRpcProvider, Contract, parseEther, formatEther } from "ethers";
import { writeFileSync, chmodSync } from "node:fs";
import { ARCA_KEY_DOMAIN, ARCA_KEY_TYPES, arcaKeyMessage } from "../src/wallet/sig-key.js";

const PK = process.env.E2E_PK;
if (!PK) { console.error("E2E_PK env required"); process.exit(1); }
const BASE = process.env.ARCA_BASE || "http://localhost:8790";
const RPC = process.env.ARCA_RPC || "https://evmrpc-testnet.0g.ai";
const REGISTRY = process.env.ARCA_REGISTRY_ADDR || "0xc196C28886c93462f55A78134b5bF6118A3f5860";
const DEPOSIT = process.env.E2E_DEPOSIT || "0.2";
const REG_ABI = [
  "function isDelegate(address,address) view returns (bool)",
  "function setDelegate(address delegate, bool authorized) external",
];

async function mint(base: string, sessionToken: string, label: string) {
  const r = await fetch(`${base}/connectors/mint`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${sessionToken}` },
    body: JSON.stringify({ label }),
  });
  const j = (await r.json()) as { token?: string; id?: string; reason?: string; error?: string };
  if (!r.ok || !j.token) throw new Error("mint failed: " + JSON.stringify(j));
  console.log(`minted "${label}": id=${j.id?.slice(0, 12)}…`);
  return { label, token: j.token, id: j.id };
}

async function main() {
  const provider = new JsonRpcProvider(RPC);
  const wallet = new Wallet(PK!, provider);
  console.log("wallet 485d:", wallet.address);
  console.log("balance:", formatEther(await provider.getBalance(wallet.address)), "0G");

  // 1. session (EIP-712) → token + deterministic signer
  const sig = await wallet.signTypedData(ARCA_KEY_DOMAIN, ARCA_KEY_TYPES, arcaKeyMessage());
  const sres = await fetch(`${BASE}/session`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ wallet: wallet.address, signature: sig }),
  });
  const sj = (await sres.json()) as { token?: string; signerAddress?: string; error?: string };
  if (!sres.ok || !sj.token || !sj.signerAddress) throw new Error("session failed: " + JSON.stringify(sj));
  const sessionToken = sj.token;
  const signerAddress = sj.signerAddress;
  console.log("session ✓ · signer:", signerAddress);

  // 2. fund the signer (skip if already has gas)
  const bal = await provider.getBalance(signerAddress);
  console.log("signer balance:", formatEther(bal), "0G");
  if (bal === 0n) {
    console.log(`funding signer ${DEPOSIT} 0G…`);
    const tx = await wallet.sendTransaction({ to: signerAddress, value: parseEther(DEPOSIT) });
    console.log("  deposit tx:", tx.hash);
    await tx.wait();
    console.log("  funded ✓");
  } else {
    console.log("already funded ✓");
  }

  // 3. authorize the signer as a registry delegate (skip if already a delegate)
  const reg = new Contract(REGISTRY, REG_ABI, wallet);
  const authed = (await reg.isDelegate(wallet.address, signerAddress)) as boolean;
  if (!authed) {
    console.log("setDelegate…");
    const tx = await reg.setDelegate(signerAddress, true);
    console.log("  setDelegate tx:", tx.hash);
    await tx.wait();
    console.log("  authorized ✓");
  } else {
    console.log("already authorized ✓");
  }

  // 4. mint two per-agent tokens via the session bearer (Tier-2 no-extra-signature path)
  const claude = await mint(BASE, sessionToken, "claude-pane3");
  const opencode = await mint(BASE, sessionToken, "opencode-pane4");

  // 5. persist tokens for the agent configs (chmod 600 — these are credentials)
  const out = { base: BASE, mcpUrl: `${BASE}/mcp`, signerAddress, sessionToken, claude, opencode };
  writeFileSync("/tmp/arca-e2e-tokens.json", JSON.stringify(out, null, 2));
  chmodSync("/tmp/arca-e2e-tokens.json", 0o600);
  console.log("\n✓ setup complete → /tmp/arca-e2e-tokens.json (chmod600)");
}
main().catch((e) => { console.error("✗", e instanceof Error ? e.message : e); process.exit(1); });
