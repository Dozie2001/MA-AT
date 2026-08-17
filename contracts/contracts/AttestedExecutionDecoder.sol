// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

library AttestedExecutionDecoder {
    bytes32 internal constant EXECUTION_EVENT_SIGNATURE =
        keccak256("AgentExecutionRecorded(address,bytes32,bool,uint256,uint256)");

    struct ReceiptLog {
        address emitter;
        bytes32[] topics;
        bytes data;
    }

    struct Execution {
        address agent;
        bytes32 executionId;
        bool success;
        uint256 volume;
        uint256 observedAt;
    }

    function decode(
        bytes calldata encodedTransaction,
        address sourceReporter
    ) internal pure returns (Execution memory execution) {
        (uint8 txType, bytes[] memory chunks) = abi.decode(encodedTransaction, (uint8, bytes[]));
        require(txType <= 4, "unsupported transaction type");

        uint256 receiptChunkIndex = txType <= 2 ? 2 : 3;
        require(chunks.length == receiptChunkIndex + 1, "invalid transaction chunks");

        (
            ,
            ,
            ,
            bool toIsNull,
            address destination,
            ,

        ) = abi.decode(chunks[0], (uint64, uint64, address, bool, address, uint256, bytes));
        require(!toIsNull && destination == sourceReporter, "unexpected transaction destination");

        (uint8 receiptStatus, , ReceiptLog[] memory logs, ) = abi.decode(
            chunks[receiptChunkIndex],
            (uint8, uint64, ReceiptLog[], bytes)
        );
        require(receiptStatus == 1, "source transaction failed");

        uint256 matchingLogs;
        for (uint256 i = 0; i < logs.length; i++) {
            ReceiptLog memory sourceLog = logs[i];
            if (
                sourceLog.emitter != sourceReporter ||
                sourceLog.topics.length != 3 ||
                sourceLog.topics[0] != EXECUTION_EVENT_SIGNATURE
            ) {
                continue;
            }

            require(uint256(sourceLog.topics[1]) >> 160 == 0, "invalid agent topic");
            require(sourceLog.data.length == 96, "invalid execution event data");

            matchingLogs += 1;
            execution.agent = address(uint160(uint256(sourceLog.topics[1])));
            execution.executionId = sourceLog.topics[2];
            (execution.success, execution.volume, execution.observedAt) = abi.decode(
                sourceLog.data,
                (bool, uint256, uint256)
            );
        }

        require(matchingLogs == 1, "expected exactly one execution event");
    }
}
