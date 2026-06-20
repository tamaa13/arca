// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title  ArcaRegistry
/// @notice Minimal on-chain index of 0G Storage root hashes, keyed by OWNER.
///         Arca stores each encrypted memory blob on 0G Storage; every blob has a
///         32-byte root hash. This contract anchors those roots on 0G Chain keyed
///         by the owner (the user's wallet), so a user recovers their full memory
///         list from their wallet alone on any machine — un-ruggable + portable.
/// @dev    Two ways to anchor:
///           - `addRoot` / `addRoots`: the owner anchors their own roots (msg.sender).
///           - `addRootFor` / `addRootsFor`: a DELEGATE the owner authorized once
///             (a funded session-signer) anchors on the owner's behalf — so the
///             owner's wallet never needs to sign or pay per save, yet roots stay
///             keyed by the owner for cross-device recovery.
///         Delegation gates anchoring to prevent third parties padding a user's
///         root list. No owner, no admin, append-only.
contract ArcaRegistry {
    /// @notice All root hashes anchored under a given owner, in insertion order.
    mapping(address => bytes32[]) private _roots;

    /// @notice owner => delegate => authorized to anchor on the owner's behalf.
    mapping(address => mapping(address => bool)) public isDelegate;

    /// @param owner The account the root is anchored under.
    /// @param root  The 32-byte 0G Storage root hash.
    /// @param index The position of `root` in the owner's list (0-based).
    event RootAdded(address indexed owner, bytes32 root, uint256 index);

    /// @param owner     The account granting/revoking.
    /// @param delegate  The session-signer being authorized.
    /// @param authorized True = granted, false = revoked.
    event DelegateSet(address indexed owner, address indexed delegate, bool authorized);

    // --- delegation -----------------------------------------------------------

    /// @notice Authorize or revoke `delegate` to anchor roots under the caller.
    function setDelegate(address delegate, bool authorized) external {
        isDelegate[msg.sender][delegate] = authorized;
        emit DelegateSet(msg.sender, delegate, authorized);
    }

    // --- anchoring (self) -----------------------------------------------------

    /// @notice Anchor a single root under the caller.
    function addRoot(bytes32 root) external {
        _add(msg.sender, root);
    }

    /// @notice Anchor a batch of roots under the caller.
    function addRoots(bytes32[] calldata roots) external {
        for (uint256 i = 0; i < roots.length; ++i) _add(msg.sender, roots[i]);
    }

    // --- anchoring (delegated) ------------------------------------------------

    /// @notice Anchor a single root under `owner`. Caller must be an authorized delegate.
    function addRootFor(address owner, bytes32 root) external {
        require(isDelegate[owner][msg.sender], "ArcaRegistry: not a delegate");
        _add(owner, root);
    }

    /// @notice Anchor a batch of roots under `owner`. Caller must be an authorized delegate.
    function addRootsFor(address owner, bytes32[] calldata roots) external {
        require(isDelegate[owner][msg.sender], "ArcaRegistry: not a delegate");
        for (uint256 i = 0; i < roots.length; ++i) _add(owner, roots[i]);
    }

    // --- reads ----------------------------------------------------------------

    /// @notice Every root anchored under `owner`, in insertion order.
    function getRoots(address owner) external view returns (bytes32[] memory) {
        return _roots[owner];
    }

    /// @notice How many roots `owner` has anchored.
    function rootCount(address owner) external view returns (uint256) {
        return _roots[owner].length;
    }

    // --- internal -------------------------------------------------------------

    function _add(address owner, bytes32 root) private {
        uint256 index = _roots[owner].length;
        _roots[owner].push(root);
        emit RootAdded(owner, root, index);
    }
}
