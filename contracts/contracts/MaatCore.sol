// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract MaatCore {
    enum Tier {
        None,
        Bronze,
        Silver,
        Gold,
        Suspended
    }

    struct AgentMetrics {
        uint256 executionCount;
        uint256 successCount;
        uint256 totalVolume;
        uint256 lastSeenAt;
        Tier tier;
    }

    mapping(address => AgentMetrics) internal metricsByAgent;
    mapping(bytes32 => bool) public processedExecutionIds;
    address public verifier;

    modifier onlyVerifier() {
        require(msg.sender == verifier, "caller is not verifier");
        _;
    }

    event AgentMetricsUpdated(
        address indexed agent,
        bytes32 indexed executionId,
        uint256 executionCount,
        uint256 successCount,
        uint256 totalVolume,
        uint256 lastSeenAt,
        Tier tier
    );

    constructor(address initialVerifier) {
        verifier = initialVerifier;
    }

    function setVerifier(address newVerifier) external onlyVerifier {
        verifier = newVerifier;
    }

    function recordVerifiedExecution(
        address agent,
        bytes32 executionId,
        bool success,
        uint256 volume,
        uint256 observedAt
    ) external onlyVerifier {
        require(!processedExecutionIds[executionId], "execution already processed");

        processedExecutionIds[executionId] = true;

        AgentMetrics storage metrics = metricsByAgent[agent];
        metrics.executionCount += 1;
        if (success) {
            metrics.successCount += 1;
        }
        metrics.totalVolume += volume;
        metrics.lastSeenAt = observedAt;
        metrics.tier = _computeTier(metrics);

        emit AgentMetricsUpdated(
            agent,
            executionId,
            metrics.executionCount,
            metrics.successCount,
            metrics.totalVolume,
            metrics.lastSeenAt,
            metrics.tier
        );
    }

    function getMetrics(address agent) external view returns (AgentMetrics memory) {
        return metricsByAgent[agent];
    }

    function tierOf(address agent) external view returns (Tier) {
        return metricsByAgent[agent].tier;
    }

    function _computeTier(AgentMetrics memory metrics) internal pure returns (Tier) {
        if (metrics.executionCount < 3) {
            return Tier.None;
        }

        uint256 successRateBps = (metrics.successCount * 10_000) / metrics.executionCount;

        if (metrics.executionCount >= 25 && successRateBps >= 9_200 && metrics.totalVolume >= 100_000 ether) {
            return Tier.Gold;
        }

        if (metrics.executionCount >= 10 && successRateBps >= 8_500 && metrics.totalVolume >= 10_000 ether) {
            return Tier.Silver;
        }

        if (metrics.executionCount >= 3 && successRateBps >= 7_000) {
            return Tier.Bronze;
        }

        return Tier.Suspended;
    }
}
