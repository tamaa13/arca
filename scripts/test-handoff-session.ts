/** Operator-blind /session — the signature reaches the server ONLY as an ECIES
 *  envelope (Option-3), decrypted in-process. Proves the sealed-container handoff
 *  path end-to-end through the real http-server. No chain/funds needed. */
import { spawn } from "node:child_process";
import { Wallet } from "ethers";
import { encryptToPubkey } from "../src/sandbox/handoff.js";
import { ARCA_KEY_DOMAIN, ARCA_KEY_TYPES, arcaKeyMessage } from "../src/wallet/sig-key.js";

const PORT = "8790";
const BASE = `http://localhost:${PORT}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const server = spawn("bun", ["src/transport/http-server.ts"], { env: { ...process.env, ARCA_PORT: PORT }, stdio: "inherit" });
const done = (code: number) => { try { server.kill("SIGKILL"); } catch {} process.exit(code); };

try {
  for (let i = 0; ; i++) {
    try { if ((await fetch(`${BASE}/health`)).ok) break; } catch {}
    if (i > 40) throw new Error("server not healthy");
    await sleep(250);
  }

  const wallet = Wallet.createRandom();
  const sig = await wallet.signTypedData(ARCA_KEY_DOMAIN, ARCA_KEY_TYPES, arcaKeyMessage());

  // 1. fetch the enclave bootstrap pubkey, encrypt the signature to it.
  const { pubkey } = await (await fetch(`${BASE}/bootstrap/pubkey`)).json();
  console.log("enclave bootstrap pubkey:", pubkey.slice(0, 18) + "…");
  const envelope = encryptToPubkey(pubkey, new TextEncoder().encode(sig));

  // 2. POST /session with the ENCRYPTED envelope only (no plaintext signature).
  const r1 = await fetch(`${BASE}/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ wallet: wallet.address, envelope }),
  });
  const d1 = await r1.json();
  const blindOk = r1.ok && typeof d1.token === "string" && d1.token.startsWith("arca_live_");
  console.log("operator-blind (envelope) → token:", blindOk ? d1.token.slice(0, 18) + "…" : `FAIL ${JSON.stringify(d1)}`);

  // 3. a garbage envelope must be rejected (not silently accepted).
  const bad = { ...envelope, ciphertextHex: envelope.ciphertextHex.replace(/.$/, "0") };
  const r2 = await fetch(`${BASE}/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ wallet: wallet.address, envelope: bad }),
  });
  const tamperRejected = !r2.ok;
  console.log("tampered envelope rejected:", tamperRejected, `(http ${r2.status})`);

  const pass = blindOk && tamperRejected;
  console.log(pass ? "\n✅ ECIES HANDOFF /session PASS — envelope delivered + decrypted in-process (proves the handoff crypto; NOT operator-blind: the decrypt runs in the operator process, not an enclave)" : "\n❌ FAIL");
  done(pass ? 0 : 1);
} catch (e) {
  console.error("✗", e instanceof Error ? e.message : e);
  done(1);
}
