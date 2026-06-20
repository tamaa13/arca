// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title  ArcaRegistry
/// @notice Minimal, permissionless on-chain index of 0G Storage root hashes.
///         Arca stores each encrypted memory blob on 0G Storage; every blob
///         has a 32-byte root hash. This contract anchors those root hashes on
///         0G Chain (Aristotle, chainId 16661) keyed by the caller's address,
///         so a user can recover their full memory list from their key alone on
///         any machine — the local index becomes optional, the list un-ruggable.
/// @dev    No owner, no admin. Every account anchors only its own roots under
///         msg.sender. Append-only by construction (no removal), mirroring
///         0G Storage's pay-once + append-only guarantees.
contract ArcaRegistry {
    /// @notice All root hashes anchored by a given user, in insertion order.
    mapping(address => bytes32[]) private _roots;

    /// @notice Emitted when a user anchors a memory root hash.
    /// @param user  The account that anchored the root (always msg.sender).
    /// @param root  The 32-byte 0G Storage root hash.
    /// @param index The position of `root` in the user's list (0-based).
    event RootAdded(address indexed user, bytes32 root, uint256 index);

    /// @notice Anchor a single 0G Storage root hash under the caller.
    /// @param root The 32-byte root hash to anchor.
    function addRoot(bytes32 root) external {
        uint256 index = _roots[msg.sender].length;
        _roots[msg.sender].push(root);
        emit RootAdded(msg.sender, root, index);
    }

    /// @notice Anchor a batch of 0G Storage root hashes under the caller.
    /// @param roots The root hashes to anchor, appended in array order.
    function addRoots(bytes32[] calldata roots) external {
        bytes32[] storage list = _roots[msg.sender];
        uint256 index = list.length;
        for (uint256 i = 0; i < roots.length; ++i) {
            list.push(roots[i]);
            emit RootAdded(msg.sender, roots[i], index);
            unchecked {
                ++index;
            }
        }
    }

    /// @notice Return every root hash anchored by `user`, in insertion order.
    /// @param user The account whose anchored roots to read.
    /// @return The user's full list of anchored root hashes.
    function getRoots(address user) external view returns (bytes32[] memory) {
        return _roots[user];
    }

    /// @notice Return how many roots `user` has anchored.
    /// @param user The account to count anchored roots for.
    /// @return The number of roots anchored by `user`.
    function rootCount(address user) external view returns (uint256) {
        return _roots[user].length;
    }
}
