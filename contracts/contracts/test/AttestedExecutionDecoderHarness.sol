// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../AttestedExecutionDecoder.sol";

contract AttestedExecutionDecoderHarness {
    function decodeExecution(
        bytes calldata encodedTransaction,
        address sourceReporter
    )
        external
        pure
        returns (
            address agent,
            bytes32 executionId,
            bool success,
            uint256 volume,
            uint256 observedAt
        )
    {
        AttestedExecutionDecoder.Execution memory execution = AttestedExecutionDecoder.decode(
            encodedTransaction,
            sourceReporter
        );
        return (
            execution.agent,
            execution.executionId,
            execution.success,
            execution.volume,
            execution.observedAt
        );
    }
}
