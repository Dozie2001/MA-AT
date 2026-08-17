// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {MaatTrustRegistry} from "./MaatTrustRegistry.sol";

contract MaatCreditPolicy {
    uint256 public constant BRONZE_LIMIT_USDC = 1_000 * 1_000_000;
    uint256 public constant SILVER_LIMIT_USDC = 10_000 * 1_000_000;
    uint256 public constant GOLD_LIMIT_USDC = 50_000 * 1_000_000;

    MaatTrustRegistry public immutable trustRegistry;

    error InvalidTrustRegistry();

    constructor(address trustRegistryAddress) {
        if (trustRegistryAddress == address(0)) revert InvalidTrustRegistry();
        trustRegistry = MaatTrustRegistry(trustRegistryAddress);
    }

    function creditLimitUsdc(address payer) public view returns (uint256) {
        MaatTrustRegistry.Tier tier = trustRegistry.tierOf(payer);

        if (tier == MaatTrustRegistry.Tier.Gold) return GOLD_LIMIT_USDC;
        if (tier == MaatTrustRegistry.Tier.Silver) return SILVER_LIMIT_USDC;
        if (tier == MaatTrustRegistry.Tier.Bronze) return BRONZE_LIMIT_USDC;
        return 0;
    }

    function canExtendTerms(address payer, uint256 invoiceAmount) external view returns (bool) {
        return invoiceAmount > 0 && invoiceAmount <= creditLimitUsdc(payer);
    }
}
