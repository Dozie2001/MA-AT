// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract ExecutionReporter {
    event AgentExecutionRecorded(
        address indexed agent,
        bytes32 indexed executionId,
        bool success,
        uint256 volume,
        uint256 timestamp
    );

    function reportExecution(
        address agent,
        bytes32 executionId,
        bool success,
        uint256 volume
    ) external {
        emit AgentExecutionRecorded(agent, executionId, success, volume, block.timestamp);
    }
}

