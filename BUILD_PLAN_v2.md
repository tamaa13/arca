# Arca v2 — Build Plan (remote, multi-platform, wallet, TEE)

> Status: planning → building Phase 1. v1 (local stdio MCP) is shipped + mainnet-proven
> and stays the Jun-23 group-stage entry. v2 is the knockout-round product.

## What Arca is
User-owned, cross-agent **personal** memory on 0G. One remote MCP that every AI agent
connects to; memory is encrypted to a key **derived from the user's own wallet**, stored
on 0G Storage, anchored on 0G Chain (`ArcaRegistry`), and processed inside a **confidential
enclave (TEE)** so the operator can't read it. No inter-user sharing (cut). No inference at
save/recall.

## Decisions (locked)
- **Transport: remote only.** No local stdio. One hosted MCP over **Streamable HTTP** (SSE
  deprecated). Auth: **OAuth 2.1 + bearer token** (covers all platforms below).
- **Multi-platform, one URL:** Claude Code/web, ChatGPT, OpenCode, Cursor, Copilot,
  Antigravity ✅; Codex remote is in-flux → `mcp-remote` bridge as fallback.
- **Key = wallet-signature-derived** (NOT the wallet privkey, NOT a local file). Reuse
  anima's proven pattern: `HKDF-SHA256(EIP-712 signature)` → AES-256-GCM, deterministic
  across wallets (RFC-6979), EIP-712 typed-data for phishing safety, per-scope keys.
  (ref: anima `packages/core/src/wallet/operator-keystore-crypto.ts`)
- **TEE host:** Phala Cloud (confidential container, decentralized) or a confidential VM.
  CPU-only (lightweight crypto + I/O, NO GPU) → cheap (~$20-50/mo, deposit-funded).
- **0G Compute** = per-task inference (~$0.003/1K tok, on-demand) → reserved for Phase 3 AI
  features only, never per save.

## Architecture
```
agents (Claude/ChatGPT/Cursor/Copilot/Codex/OpenCode/Antigravity)
   │ HTTPS + OAuth/bearer (one URL)        dashboard (web): SIWE connect · sign EIP-712 · deposit
   ▼                                          │ OAuth link
 ARCA MCP — in TEE (enclave) ◄────────────────┘
   • session ↔ wallet · enc-key HKDF-from-sig (in-enclave)
   • encrypt/decrypt in-enclave · session-signer pays from deposit
   ▼
 0G Storage (blobs) + 0G Chain (ArcaRegistry)
   ▲  fallback: wallet → 0G directly (recover without the service) → un-ruggable holds
```

## Who can read (honest)
You ✅ (wallet) · operator ❌ (TEE-attested) · 0G ❌ (encrypted) · agent provider ⚠️ sees
plaintext transiently (unavoidable for any agent memory tool).

## Phase 1 — sub-phases (each shippable, de-risks one thing)
The memory engine (encrypt → 0G → registry → recall) is **already built + mainnet-proven**.
Phase 1 builds the *front door*; it does not rebuild the engine.

- **1a — Remote transport (multi-platform proof).** Swap stdio → Streamable HTTP; serve over
  HTTPS; static bearer for testing. Reuse all save/recall core. Test: one URL works in
  Claude web + Cursor + Codex/bridge. *Not private yet — transport proof only.*
- **1b — Wallet + sig-derived key + deposit.** Dashboard (wagmi + SIWE), EIP-712 sign →
  HKDF key (port anima). OAuth/bearer ↔ wallet ↔ key session. Deposit + session-signer.
  Adapt `store`/`crypto` to the wallet-derived key; address = wallet. *Not operator-blind yet.*
- **1c — TEE (operator-blind).** Package as confidential container → Phala/conf-VM; key
  derive + crypto in-enclave; expose attestation. *The privacy milestone.*

### Components
```
NEW:    src/transport/ (HTTP)  src/auth/ (OAuth+bearer+session)
        src/wallet/ (SIWE+HKDF, port anima)  src/payment/ (deposit+signer)
        dashboard/ (web)  deploy/ (TEE config)
REUSE:  src/og  src/memory/store  src/registry  save/recall tools  scripts/* (recovery fallback)
```

## Deferred (NOT Phase 1 — no overscope)
working-tree · summarize/chat (0G Compute) · Lit Protocol · granular revoke · inter-user
sharing · fancy billing UI. → Phase 3+.

## Honest scope
Multi-week, not a weekend. Parts need the user's real infra/accounts (TEE deploy, OAuth
provider registration, hosting, funded deposit) — those are flagged, not claimed as done.
Order: **1a → 1b → 1c** (hardest, TEE, last). Don't overclaim a stage until it's tested.

## Progress
- **1a — remote transport: DONE + tested.** Streamable HTTP MCP (`src/transport/http-server.ts`),
  bearer auth, per-session transport, `/health`. Proven on testnet: MCP client → tools → save →
  recall, all over remote HTTP.
- **1b key model: DONE + tested.** `src/wallet/sig-key.ts` — HKDF-from-EIP-712-signature (anima
  pattern), `keyedCrypto()` adapter. Unit-tested (deterministic / cross-device, isolated) AND
  end-to-end through 0G testnet (encrypt with wallet key → 0G Storage + registry → recall → decrypt).
- **Remaining 1b/1c — NOT built (needs a web app + the user's infra; deliberately not half-built):**
  - per-user session state isolation (per-user index, or registry-only recall)
  - deposit + per-user session-signer; **ArcaRegistry owner-mapping** (contract change so roots are
    keyed by the wallet, not the gas signer) → unlocks cross-device-by-wallet recovery
  - OAuth 2.1 (Claude/ChatGPT auth) wired to wallet sessions
  - dashboard web app (SIWE connect · sign · deposit · connector URL) — design brief done
  - 1c TEE: confidential-container deploy (Phala / conf-VM) + attestation
  These are a cohesive chunk gated on the dashboard + real infra (OAuth provider, Phala account,
  contract redeploy, funded deposit). Half-building them now = throwaway stopgaps → skipped on purpose.
