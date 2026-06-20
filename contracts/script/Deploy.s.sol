// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {IngatRegistry} from "../src/IngatRegistry.sol";

/// @title  Deploy — IngatRegistry deployment script (0G mainnet, Aristotle 16661).
/// @notice Deploys the permissionless IngatRegistry that anchors 0G Storage
///         root hashes on 0G Chain. No constructor args, no admin — fully
///         permissionless. Print the deployed address and set it as
///         INGAT_REGISTRY_ADDR (consumed by src/registry/client.ts via OG.registry).
///
/// Env vars:
///   - PRIVATE_KEY (required) deployer key (funded with ~0.1 0G for gas)
///
/// Run (Aristotle mainnet, chainId 16661):
///   forge script script/Deploy.s.sol:Deploy \
///     --rpc-url zg_mainnet \
///     --broadcast \
///     --legacy --priority-gas-price 2000000000 \
///     --evm-version cancun
///
///   (rpc_endpoints.zg_mainnet = https://evmrpc.0g.ai in foundry.toml)
contract Deploy is Script {
    function run() external returns (IngatRegistry registry) {
        uint256 pk = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(pk);
        registry = new IngatRegistry();
        vm.stopBroadcast();

        console2.log("IngatRegistry deployed at:", address(registry));
        console2.log("Set this as INGAT_REGISTRY_ADDR for the TS client.");
    }
}
