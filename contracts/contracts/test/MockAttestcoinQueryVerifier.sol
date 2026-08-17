// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IAttestcoinQueryVerifier} from "../interfaces/IAttestcoinQueryVerifier.sol";

contract MockAttestcoinQueryVerifier is IAttestcoinQueryVerifier {
    uint64 internal constant MOCK_TX_INDEX = 88;

    function calculateTxIndex(MerkleProof calldata) external pure returns (uint64) {
        return MOCK_TX_INDEX;
    }

    function verify(
        uint64,
        uint64,
        bytes calldata,
        MerkleProof calldata merkleProof,
        ContinuityProof calldata
    ) external pure returns (bool) {
        return merkleProof.root != bytes32(uint256(1));
    }
}
