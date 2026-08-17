// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./MaatCore.sol";

contract MaatPolicy {
    MaatCore public immutable maatCore;

    constructor(address maatCoreAddress) {
        maatCore = MaatCore(maatCoreAddress);
    }

    function canOperate(address agent) external view returns (bool) {
        MaatCore.Tier tier = maatCore.tierOf(agent);
        return tier != MaatCore.Tier.None && tier != MaatCore.Tier.Suspended;
    }

    function delegationCap(address agent) external view returns (uint256) {
        MaatCore.Tier tier = maatCore.tierOf(agent);

        if (tier == MaatCore.Tier.Gold) {
            return 1_000_000 ether;
        }
        if (tier == MaatCore.Tier.Silver) {
            return 250_000 ether;
        }
        if (tier == MaatCore.Tier.Bronze) {
            return 50_000 ether;
        }
        return 0;
    }
}
