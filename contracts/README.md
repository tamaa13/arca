# IngatRegistry — on-chain memory anchor (0G Chain, Aristotle 16661)

Minimal, permissionless registry that anchors **0G Storage root hashes** on
**0G Chain** keyed by the caller's address. Each Ingat memory blob is encrypted
and stored on 0G Storage under a 32-byte root hash; anchoring those roots on
chain makes a user's memory list **recoverable from their key alone** on any
machine (the local `~/.ingat/index.json` becomes optional) and **un-ruggable**
once anchored. It also makes 0G Chain explicitly load-bearing — our own contract.

## Contract API (`src/IngatRegistry.sol`, Solidity ^0.8.20, MIT)

| Member | Signature | Notes |
| --- | --- | --- |
| state | `mapping(address => bytes32[]) private _roots` | per-user root list, append-only |
| event | `RootAdded(address indexed user, bytes32 root, uint256 index)` | emitted per anchored root |
| write | `addRoot(bytes32 root)` | push one root under `msg.sender`, emit event |
| write | `addRoots(bytes32[] calldata roots)` | batch version (one tx, N events) |
| view | `getRoots(address user) returns (bytes32[])` | full list, insertion order |
| view | `rootCount(address user) returns (uint256)` | list length |

No owner, no admin. Every account anchors only its own roots under `msg.sender`.

## Build

> **PATH note:** on this machine `forge` on `$PATH` resolves to Laravel Herd's
> `forge` (a Laravel Forge CLI), not Foundry. Use the absolute path to Foundry's
> binary: `~/.foundry/bin/forge`.

```sh
cd contracts
# one-time: vendor forge-std (gitignored)
git clone --depth 1 https://github.com/foundry-rs/forge-std lib/forge-std && rm -rf lib/forge-std/.git
~/.foundry/bin/forge build
```

Compiles clean with Solc 0.8.24 (`Compiler run successful!`).

## Deploy (PM / Tama only — needs a FUNDED key)

`rpc_endpoints.zg_mainnet = https://evmrpc.0g.ai` is set in `foundry.toml`
(chainId **16661**, Aristotle mainnet).

### Option A — `forge create` (simplest, one contract, no constructor args)

```sh
cd contracts
~/.foundry/bin/forge create src/IngatRegistry.sol:IngatRegistry \
  --rpc-url https://evmrpc.0g.ai \
  --private-key $KEY \
  --legacy --priority-gas-price 2000000000 \
  --broadcast
```

### Option B — deploy script (logs the address, mirrors Yap's style)

```sh
cd contracts
PRIVATE_KEY=$KEY ~/.foundry/bin/forge script script/Deploy.s.sol:Deploy \
  --rpc-url zg_mainnet \
  --broadcast \
  --legacy --priority-gas-price 2000000000 \
  --evm-version cancun
```

## After deploy

Take the printed address and expose it to the TS client (`src/registry/client.ts`),
which reads `OG.registry` (env `INGAT_REGISTRY_ADDR`) from `src/types.ts`:

```sh
export INGAT_REGISTRY_ADDR=0xYourDeployedRegistryAddress
```

If `INGAT_REGISTRY_ADDR` is unset, the client throws a clear
"registry not deployed — set INGAT_REGISTRY_ADDR" error.
