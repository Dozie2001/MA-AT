// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract AttestedPaymentDiagnosticHarness {
    struct ReceiptLog {
        address emitter;
        bytes32[] topics;
        bytes data;
    }

    function decodeEnvelope(
        bytes calldata encodedTransaction
    ) external pure returns (uint8 txType, uint256 chunkCount, bytes memory common, bytes memory receipt) {
        bytes[] memory chunks;
        (txType, chunks) = abi.decode(encodedTransaction, (uint8, bytes[]));
        uint256 receiptChunkIndex = txType <= 2 ? 2 : 3;
        return (txType, chunks.length, chunks[0], chunks[receiptChunkIndex]);
    }

    function decodeCommon(
        bytes calldata commonChunk
    ) external pure returns (address sender, bool toIsNull, address destination, uint256 dataLength) {
        bytes memory transactionData;
        (, , sender, toIsNull, destination, , transactionData) = abi.decode(
            commonChunk,
            (uint64, uint64, address, bool, address, uint256, bytes)
        );
        return (sender, toIsNull, destination, transactionData.length);
    }

    function decodeReceipt(
        bytes calldata receiptChunk
    ) external pure returns (uint8 status, uint64 gasUsed, uint256 logCount, uint256 bloomLength) {
        ReceiptLog[] memory logs;
        bytes memory bloom;
        (status, gasUsed, logs, bloom) = abi.decode(
            receiptChunk,
            (uint8, uint64, ReceiptLog[], bytes)
        );
        return (status, gasUsed, logs.length, bloom.length);
    }
}
