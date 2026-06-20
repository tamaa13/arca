/** Read-only: show local index + on-chain anchored roots for the current key/network. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { FileKeyManager } from "../src/memory/key.js";
import { RegistryClient } from "../src/registry/client.js";
import { OG } from "../src/types.js";

const { privKeyHex, address } = new FileKeyManager().loadOrCreate();
console.log("address :", address);
console.log("network :", OG.rpc, "(chainId", OG.chainId + ")");
console.log("registry:", OG.registry);

const idxPath = path.join(os.homedir(), ".arca", "index.json");
console.log("\n--- local index (~/.arca/index.json) ---");
console.log(fs.existsSync(idxPath) ? fs.readFileSync(idxPath, "utf8").trim() : "(none)");

if (OG.registry) {
  const roots = await new RegistryClient(privKeyHex).getRoots(address);
  console.log(`\n--- on-chain anchored roots for ${address} (${roots.length}) ---`);
  for (const r of roots) console.log("  ", r);
  console.log(
    roots.length > 0
      ? "\n✅ memory IS anchored on 0G Chain (un-ruggable) — only the blob read-back waits for storage."
      : "\n(no roots anchored yet)",
  );
}
