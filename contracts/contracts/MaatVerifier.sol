// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./MaatCore.sol";
import "./AttestedExecutionDecoder.sol";

interface INativeQueryVerifier {
    struct MerkleProofEntry {
        bytes32 hash;
        bool isLeft;
    }

    struct MerkleProof {
        bytes32 root;
        MerkleProofEntry[] siblings;
    }

    struct ContinuityProof {
        bytes32 lowerEndpointDigest;
        bytes32[] roots;
    }

    function calculateTxIndex(MerkleProof calldata merkleProof) external view returns (uint64);

    function verify(
        uint64 chainKey,
        uint64 height,
        bytes calldata encodedTransaction,
        MerkleProof calldata merkleProof,
        ContinuityProof calldata continuityProof
    ) external view returns (bool);
}

contract MaatVerifier {
    using AttestedExecutionDecoder for bytes;

    INativeQueryVerifier public constant VERIFIER =
        INativeQueryVerifier(0x0000000000000000000000000000000000000FD2);

    MaatCore public immutable maatCore;
    uint64 public immutable sourceChainKey;
    address public immutable sourceReporter;
    mapping(bytes32 => bool) public processedQueries;

    event ExecutionProofAccepted(
        uint64 indexed chainKey,
        uint64 indexed height,
        uint64 indexed txIndex,
        address agent,
        bytes32 executionId
    );

    constructor(address maatCoreAddress, uint64 sourceChainKey_, address sourceReporter_) {
        require(maatCoreAddress != address(0), "invalid MaatCore address");
        require(sourceReporter_ != address(0), "invalid source reporter");

        maatCore = MaatCore(maatCoreAddress);
        sourceChainKey = sourceChainKey_;
        sourceReporter = sourceReporter_;
    }

    function submitVerifiedExecution(
        uint64 chainKey,
        uint64 height,
        bytes calldata encodedTransaction,
        INativeQueryVerifier.MerkleProof calldata merkleProof,
        INativeQueryVerifier.ContinuityProof calldata continuityProof
    ) external returns (bool) {
        require(chainKey == sourceChainKey, "unexpected source chain");

        uint64 txIndex = VERIFIER.calculateTxIndex(merkleProof);
        bytes32 queryKey = keccak256(abi.encodePacked(chainKey, height, txIndex));
        require(!processedQueries[queryKey], "query already processed");

        bool verified = VERIFIER.verify(
            chainKey,
            height,
            encodedTransaction,
            merkleProof,
            continuityProof
        );
        require(verified, "proof verification failed");

        AttestedExecutionDecoder.Execution memory execution = encodedTransaction.decode(
            sourceReporter
        );

        processedQueries[queryKey] = true;
        maatCore.recordVerifiedExecution(
            execution.agent,
            execution.executionId,
            execution.success,
            execution.volume,
            execution.observedAt
        );

        emit ExecutionProofAccepted(
            chainKey,
            height,
            txIndex,
            execution.agent,
            execution.executionId
        );
        return true;
    }
}
