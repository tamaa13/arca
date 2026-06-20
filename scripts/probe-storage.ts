/** Minimal 0G Storage probe — putBlob (blocking) + getBlob on the CURRENT network
 *  env, to see whether the selected indexer node matches the RPC chain.
 *  usage: ARCA_RPC=… ARCA_INDEXER=… npx tsx scripts/probe-storage.ts */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { OgStorageClient } from "../src/og/storage.js";
import { OG } from "../src/types.js";

const key = fs.readFileSync(path.join(os.homedir(), ".arca", "key"), "utf8").trim();
const s = new OgStorageClient(key);
const data = new TextEncoder().encode(`probe ${Date.now()}`);
console.log("RPC:", OG.rpc, "| indexer:", OG.indexer);
try {
  const root = await s.putBlob(data);
  const back = await s.getBlob(root);
  console.log(`RESULT: ✓ OK — finalized + retrieved "${new TextDecoder().decode(back)}" (${root.slice(0, 12)}…)`);
  process.exit(0);
} catch (e) {
  console.log("RESULT: ✗ FAIL —", e instanceof Error ? e.message.split("\n")[0] : String(e));
  process.exit(1);
}
