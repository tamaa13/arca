# Arca

**User-owned, cross-agent persistent memory on 0G.** Your AI agents (Claude Code, Codex, Cursor) save and recall memory through one local MCP server. Every memory is encrypted to *your* key and stored on 0G — append-only, pay-once, **un-ruggable**. Nobody, not even the operator, can delete it. You hold the key.

> *arca* — Latin for "ark / chest" — a vault you own for your memory.

## Why

Today your memory is trapped inside each app and can be wiped by whoever runs it. Arca flips that: the memory layer is **yours**, portable across agents, and economically permanent on 0G. No inference, no lock-in — just a memory you own.

## How it works (the hero loop)

```
save  (in Claude)                          recall  (in Codex)
  │                                            │
  ├─ encrypt(record, your key)  AES-256-GCM    ├─ getRoots(you)         ← 0G Chain
  ├─ rootOf(blob)              merkle, local   ├─ getBlob(root)         ← 0G Storage
  ├─ addRoot(root)             → 0G Chain      ├─ decrypt(blob)
  └─ putBlob(blob)             → 0G Storage    └─ your memory, in a different agent
```

One MCP server exposes two tools to every agent:
- `save_memory(text)` — encrypt → anchor the root on 0G **Chain** → upload the blob to 0G **Storage**.
- `recall_memory(query?)` — recover your roots from chain → fetch + decrypt from storage.

The plaintext **only** ever exists on 0G, encrypted. The local index holds pointers, never content. On a fresh machine, your whole memory list is recoverable **from the key alone** via the on-chain registry.

## Two 0G primitives, both load-bearing

- **0G Storage** — the encrypted memory blobs (pay-once + endowment → effectively permanent; ~0.13 0G/GB, one-time).
- **0G Chain** — `ArcaRegistry`, a tiny permissionless contract that anchors each memory's root per user, so the index itself is un-ruggable and portable.

## On-chain (deployed + verified)

| | Network | Address |
|---|---|---|
| ArcaRegistry | 0G Mainnet (Aristotle, 16661) | `0x746Cb7B6eC8521262b01E2788188fC475f95216e` |
| ArcaRegistry | 0G Galileo testnet (16602) | `0xCcFbEdd5E10051399CA2B6ea1fDF1B62126d4ECD` |

Full hero loop proven end-to-end on testnet (encrypt → storage → anchor → recall → decrypt → match). On mainnet, encrypt + Flow-submit + registry anchor/recover are proven; storage read-back finalizes automatically once 0G storage sync catches up.

## Resilient by design (anchor-first + fail-fast)

The root is computed locally and anchored on 0G **Chain before** the storage upload, and the upload is bounded by a timeout. So even when 0G storage is lagging, a save **never hangs** — it returns `pending` (anchored on-chain, blob syncing) and finalizes in the background. Recall is per-record and fail-fast, so a not-yet-finalized blob never blocks the rest.

## Quickstart

```bash
npm install
npx tsx src/cli/index.ts init        # generate/​import key, fund prompt, BACK UP YOUR KEY, wire Claude + Codex
# then, in any wired agent:
#   save_memory  "I prefer Hono + Drizzle + Neon Postgres"
#   recall_memory "drizzle"
```

Network is env-switchable (defaults to mainnet):
```
ARCA_RPC=https://evmrpc-testnet.0g.ai \
ARCA_INDEXER=https://indexer-storage-testnet-turbo.0g.ai \
ARCA_CHAIN_ID=16602 \
ARCA_REGISTRY_ADDR=0xCcFbEdd5E10051399CA2B6ea1fDF1B62126d4ECD
```

⚠️ **Back up `~/.arca/key`.** Lose it and your memory is gone forever — by design, there is no recovery.

## Layout

```
contracts/      ArcaRegistry.sol (Foundry)
src/og/         0G Storage client + AES-256-GCM crypto
src/memory/     key manager + memory store (the glue)
src/registry/   ArcaRegistry TS client
src/mcp/        MCP server (save_memory / recall_memory)
src/cli/        `arca init`
src/types.ts    shared contracts
```
