// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AttestedPaymentDecoder} from "./AttestedPaymentDecoder.sol";
import {InvoiceRegistry} from "./InvoiceRegistry.sol";
import {MaatTrustRegistry} from "./MaatTrustRegistry.sol";
import {IAttestcoinQueryVerifier} from "./interfaces/IAttestcoinQueryVerifier.sol";

contract MaatSettlementVerifier {
    using AttestedPaymentDecoder for bytes;

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
        return true;
    }
}
