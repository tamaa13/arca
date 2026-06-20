# Ingat — Build Plan (Jun 23 hero loop)

**Ingat** = user-owned, cross-agent persistent memory on 0G. Agents (Claude Code, Codex) save + recall via one MCP server; memory is ECIES-encrypted, stored on 0G Storage, the user holds the key. **Un-ruggable once anchored** (0G = pay-once + append-only, operator can't delete).

## HERO LOOP (the ONLY thing for Jun 23 — do NOT over-scope)
> save a fact in **Claude Code** → recall it in **Codex** → it's on **0G** (encrypted) → **you hold the key**.

Everything else (auto-wire-all, prepaid/top-up UI, diff-only, dashboard, zero-queue) is **DEFERRED** to post-submission (Jul 8 lock). Full-blob-per-flush, not diff, for v1.

## Contracts
All modules implement interfaces in `src/types.ts`. Build against those. Don't change a signature without PM sign-off.

## Modules / folders (each agent owns ONE folder tree)
- `src/og/` — **0G Storage + crypto.** `storage.ts` (OgStorage: putBlob/getBlob on mainnet) + `crypto.ts` (Crypto: ECIES/AES encrypt/decrypt to user key). PORT from Yap: `/Users/tama/projects/yap/apps/web/lib/0g/storage.ts` + `encrypt.ts` (proven working on mainnet — reuse the patterns, don't reinvent).
- `src/memory/` — **key + store.** `key.ts` (KeyManager: gen/load secp256k1 key at `~/.ingat/key`) + `store.ts` (MemoryStore: glue — save = encrypt→putBlob→append local index `~/.ingat/index.json`; recall = read index→getBlob→decrypt).
- `src/mcp/` — **MCP server.** `server.ts` using `@modelcontextprotocol/sdk` (stdio transport). Two tools: `save_memory(text)` and `recall_memory(query?)` → call MemoryStore. This is what Claude Code/Codex connect to.
- `src/cli/` — **`ingat init`.** `index.ts` (commander): keygen (or `--import <key>`), print address + "fund ~2 0G" + "BACK UP YOUR KEY (lose it = memory gone forever)", then wire the MCP into Claude Code + Codex configs.

## Rules for agents (PM enforces)
1. **ONLY create/edit files inside YOUR folder.** Do not touch root config (`package.json`, `tsconfig.json`), `src/types.ts`, or other agents' folders. Deps are already in `package.json` — assume available, do NOT run install. If you need a new dep, STOP and report it to PM.
2. Import the shared interfaces + `OG` config from `../types` (or `../../types`). Import other modules by their interface path (e.g. memory/store imports the `OgStorage`/`Crypto` impls from `../og/storage` / `../og/crypto`).
3. Reuse Yap's proven 0G code where relevant (read the reference files). Mainnet only (16661).
4. ESM project (`"type": "module"`, NodeNext). Use `.js` extensions in relative imports per NodeNext, or rely on tsx. Gotcha: `eciesjs` can be ESM-fussy — prefer the `@0gfoundation/0g-storage-ts-sdk` built-in ECIES if it exposes one; else handle interop.
5. Keep it LEAN — hero loop only. No extra features.
6. Leave a short `// TODO(pm):` for anything you couldn't finish or any cross-module assumption.
