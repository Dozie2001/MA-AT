// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AttestedPaymentDecoder} from "./AttestedPaymentDecoder.sol";
import {InvoiceRegistry} from "./InvoiceRegistry.sol";
import {MaatTrustRegistry} from "./MaatTrustRegistry.sol";
import {IAttestcoinQueryVerifier} from "./interfaces/IAttestcoinQueryVerifier.sol";

contract MaatSettlementVerifier {
    using AttestedPaymentDecoder for bytes;

    uint256 public constant MAX_BATCH_SIZE = 10;

    IAttestcoinQueryVerifier public constant VERIFIER =
        IAttestcoinQueryVerifier(0x0000000000000000000000000000000000000FD2);

    InvoiceRegistry public immutable invoiceRegistry;
    MaatTrustRegistry public immutable trustRegistry;
    uint64 public immutable sourceChainKey;
    address public immutable sourceRouter;
    mapping(bytes32 => bool) public processedQueries;

    error InvalidInvoiceRegistry();
    error InvalidTrustRegistry();
    error InvalidSourceRouter();
    error UnexpectedSourceChain();
    error InvalidBatchSize();
    error BatchLengthMismatch();
    error DuplicateBatchQuery();
    error QueryAlreadyProcessed();
    error ProofVerificationFailed();

    event SettlementProofAccepted(
        uint64 indexed chainKey,
        uint64 indexed height,
        uint64 indexed txIndex,
        bytes32 invoiceId,
        address payer,
        address vendor,
        uint256 amount,
        uint256 paidAt,
        bool onTime
    );
    event SettlementBatchAccepted(
        uint64 indexed chainKey,
        bytes32 indexed batchId,
        uint256 settlementCount
    );

    constructor(
        address invoiceRegistryAddress,
        address trustRegistryAddress,
        uint64 sourceChainKey_,
        address sourceRouter_
    ) {
        if (invoiceRegistryAddress == address(0)) revert InvalidInvoiceRegistry();
        if (trustRegistryAddress == address(0)) revert InvalidTrustRegistry();
        if (sourceRouter_ == address(0)) revert InvalidSourceRouter();

        invoiceRegistry = InvoiceRegistry(invoiceRegistryAddress);
        trustRegistry = MaatTrustRegistry(trustRegistryAddress);
        sourceChainKey = sourceChainKey_;
        sourceRouter = sourceRouter_;
    }

    function submitVerifiedSettlement(
        uint64 chainKey,
        uint64 height,
        bytes calldata encodedTransaction,
        IAttestcoinQueryVerifier.MerkleProof calldata merkleProof,
        IAttestcoinQueryVerifier.ContinuityProof calldata continuityProof
    ) external returns (bool) {
        if (chainKey != sourceChainKey) revert UnexpectedSourceChain();

        uint64 txIndex = VERIFIER.calculateTxIndex(merkleProof);
        bytes32 queryKey = keccak256(abi.encodePacked(chainKey, height, txIndex));
        if (processedQueries[queryKey]) revert QueryAlreadyProcessed();

        bool verified = VERIFIER.verify(
            chainKey,
            height,
            encodedTransaction,
            merkleProof,
            continuityProof
        );
        if (!verified) revert ProofVerificationFailed();

        _acceptSettlement(chainKey, height, txIndex, queryKey, encodedTransaction);
        return true;
    }

    function submitVerifiedSettlementBatch(
        uint64 chainKey,
        uint64[] calldata heights,
        bytes[] calldata encodedTransactions,
        IAttestcoinQueryVerifier.MerkleProof[] calldata merkleProofs,
        IAttestcoinQueryVerifier.ContinuityProof calldata sharedContinuityProof
    ) external returns (bool) {
        if (chainKey != sourceChainKey) revert UnexpectedSourceChain();

        uint256 batchSize = heights.length;
        if (batchSize < 2 || batchSize > MAX_BATCH_SIZE) revert InvalidBatchSize();
        if (
            encodedTransactions.length != batchSize ||
            merkleProofs.length != batchSize
        ) revert BatchLengthMismatch();

        uint64[] memory txIndexes = new uint64[](batchSize);
        bytes32[] memory queryKeys = new bytes32[](batchSize);
        for (uint256 i = 0; i < batchSize; i++) {
            uint64 txIndex = VERIFIER.calculateTxIndex(merkleProofs[i]);
            bytes32 queryKey = keccak256(
                abi.encodePacked(chainKey, heights[i], txIndex)
            );
            if (processedQueries[queryKey]) revert QueryAlreadyProcessed();

            for (uint256 j = 0; j < i; j++) {
                if (queryKeys[j] == queryKey) revert DuplicateBatchQuery();
            }
            txIndexes[i] = txIndex;
            queryKeys[i] = queryKey;
        }

        bool verified = VERIFIER.verify(
            chainKey,
            heights,
            encodedTransactions,
            merkleProofs,
            sharedContinuityProof
        );
        if (!verified) revert ProofVerificationFailed();

        for (uint256 i = 0; i < batchSize; i++) {
            _acceptSettlement(
                chainKey,
                heights[i],
                txIndexes[i],
                queryKeys[i],
                encodedTransactions[i]
            );
        }

        emit SettlementBatchAccepted(
            chainKey,
            keccak256(abi.encode(queryKeys)),
            batchSize
        );
        return true;
    }

    function _acceptSettlement(
        uint64 chainKey,
        uint64 height,
        uint64 txIndex,
        bytes32 queryKey,
        bytes calldata encodedTransaction
    ) private {
        AttestedPaymentDecoder.Payment memory payment = encodedTransaction.decode(sourceRouter);

        processedQueries[queryKey] = true;
        bool onTime = invoiceRegistry.settleVerifiedPayment(
            payment.invoiceId,
            payment.payer,
            payment.vendor,
            payment.amount,
            payment.paidAt
        );
        trustRegistry.recordVerifiedSettlement(
            payment.invoiceId,
            payment.payer,
            payment.vendor,
            payment.amount,
            payment.paidAt,
            onTime
        );

        emit SettlementProofAccepted(
            chainKey,
            height,
            txIndex,
            payment.invoiceId,
            payment.payer,
            payment.vendor,
            payment.amount,
            payment.paidAt,
            onTime
        );
    }
}
