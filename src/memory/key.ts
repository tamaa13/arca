/**
 * Local key management — implements KeyManager (see ../types.ts).
 *
 * Persists a secp256k1 private key at ~/.arca/key (hex, chmod 600).
 * This key is the ROOT of trust: it encrypts memory AND pays/owns the 0G data.
 * Lose it = memory gone forever. Back it up via exportKey().
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Wallet } from "ethers";
import type { KeyManager } from "../types.js";

/** ~/.arca — the single home for key + index. */
const ARCA_DIR = path.join(os.homedir(), ".arca");
const KEY_PATH = path.join(ARCA_DIR, "key");

export class FileKeyManager implements KeyManager {
  /**
   * Load the existing key from ~/.arca/key, or generate a fresh
   * random secp256k1 key (ethers Wallet.createRandom) and persist it.
   * Returns the private key hex (0x-prefixed) and its EVM address.
   */
  loadOrCreate(): { privKeyHex: string; address: string } {
    fs.mkdirSync(ARCA_DIR, { recursive: true });

    if (fs.existsSync(KEY_PATH)) {
      const privKeyHex = fs.readFileSync(KEY_PATH, "utf8").trim();
      const wallet = new Wallet(privKeyHex);
      return { privKeyHex: wallet.privateKey, address: wallet.address };
    }

    const wallet = Wallet.createRandom();
    const privKeyHex = wallet.privateKey; // 0x-prefixed hex
    // Write with restrictive perms from the start (mode applies on create).
    fs.writeFileSync(KEY_PATH, privKeyHex, { encoding: "utf8", mode: 0o600 });
    // Enforce 0600 even if the file pre-existed / umask interfered.
    fs.chmodSync(KEY_PATH, 0o600);
    return { privKeyHex, address: wallet.address };
  }

  /** Return the private key hex for the user to back up. Throws if no key yet. */
  exportKey(): string {
    if (!fs.existsSync(KEY_PATH)) {
      throw new Error(
        "No key at ~/.arca/key — run loadOrCreate() (or `arca init`) first.",
      );
    }
    return fs.readFileSync(KEY_PATH, "utf8").trim();
  }
}
