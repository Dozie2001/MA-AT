// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

library AttestedPaymentDecoder {
    bytes32 internal constant PAYMENT_EVENT_SIGNATURE =
        keccak256("InvoicePaid(bytes32,address,address,uint256,uint256)");

    struct CommonTxFields {
        uint64 nonce;
        uint64 gasLimit;
        address sender;
        bool toIsNull;
        address destination;
        uint256 value;
        bytes data;
    }

    struct ReceiptLog {
        address emitter;
        bytes32[] topics;
        bytes data;
    }

    struct Payment {
        bytes32 invoiceId;
        address payer;
        address vendor;
        uint256 amount;
        uint256 paidAt;
    }

    function decode(
        bytes calldata encodedTransaction,
        address sourceRouter
    ) internal pure returns (Payment memory payment) {
        (uint8 txType, bytes[] memory chunks) = abi.decode(encodedTransaction, (uint8, bytes[]));
        require(txType <= 4, "unsupported transaction type");

        uint256 receiptChunkIndex = txType <= 2 ? 2 : 3;
        require(chunks.length == receiptChunkIndex + 1, "invalid transaction chunks");

        CommonTxFields memory common = abi.decode(chunks[0], (CommonTxFields));
        require(
            !common.toIsNull && common.destination == sourceRouter,
            "unexpected transaction destination"
        );

        (uint8 receiptStatus, , ReceiptLog[] memory logs, ) = abi.decode(
            chunks[receiptChunkIndex],
            (uint8, uint64, ReceiptLog[], bytes)
        );
        require(receiptStatus == 1, "source transaction failed");

        uint256 matchingLogs;
        for (uint256 i = 0; i < logs.length; i++) {
            ReceiptLog memory sourceLog = logs[i];
            if (
                sourceLog.emitter != sourceRouter ||
                sourceLog.topics.length != 4 ||
                sourceLog.topics[0] != PAYMENT_EVENT_SIGNATURE
            ) {
                continue;
            }

            require(uint256(sourceLog.topics[2]) >> 160 == 0, "invalid payer topic");
            require(uint256(sourceLog.topics[3]) >> 160 == 0, "invalid vendor topic");
            require(sourceLog.data.length == 64, "invalid payment event data");

            matchingLogs += 1;
            payment.invoiceId = sourceLog.topics[1];
            payment.payer = address(uint160(uint256(sourceLog.topics[2])));
            payment.vendor = address(uint160(uint256(sourceLog.topics[3])));
            (payment.amount, payment.paidAt) = abi.decode(sourceLog.data, (uint256, uint256));
        }

        require(matchingLogs == 1, "expected exactly one payment event");
    }
}
