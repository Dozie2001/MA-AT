// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract MaatTrustRegistry {
    enum Tier {
        None,
        Bronze,
        Silver,
        Gold,
        Restricted
    }

    struct PayerMetrics {
        uint64 settledInvoiceCount;
        uint64 onTimeSettlementCount;
        uint64 lateSettlementCount;
        uint64 lastSettledAt;
        uint256 totalPaidUsdc;
        Tier tier;
    }

    struct VendorMetrics {
        uint64 settledInvoiceCount;
        uint64 lastSettledAt;
        uint256 totalReceivedUsdc;
    }

    uint256 private constant USDC_UNIT = 1_000_000;

    mapping(address => PayerMetrics) private payerMetricsByAddress;
    mapping(address => VendorMetrics) private vendorMetricsByAddress;
    mapping(bytes32 => bool) public processedInvoiceIds;
    address public settlementVerifier;

    error CallerIsNotSettlementVerifier();
    error InvalidSettlementVerifier();
    error InvalidInvoiceId();
    error InvalidPayer();
    error InvalidVendor();
    error InvalidAmount();
    error InvalidSettlementTimestamp();
    error InvoiceAlreadyProcessed();

    event PayerTrustUpdated(
        address indexed payer,
        bytes32 indexed invoiceId,
        uint256 settledInvoiceCount,
        uint256 onTimeSettlementCount,
        uint256 lateSettlementCount,
        uint256 totalPaidUsdc,
        uint256 lastSettledAt,
        Tier tier
    );
    event VendorActivityUpdated(
        address indexed vendor,
        bytes32 indexed invoiceId,
        uint256 settledInvoiceCount,
        uint256 totalReceivedUsdc,
        uint256 lastSettledAt
    );
    event SettlementVerifierUpdated(address indexed previousVerifier, address indexed newVerifier);

    modifier onlySettlementVerifier() {
        if (msg.sender != settlementVerifier) revert CallerIsNotSettlementVerifier();
        _;
    }

    constructor(address initialSettlementVerifier) {
        if (initialSettlementVerifier == address(0)) revert InvalidSettlementVerifier();
        settlementVerifier = initialSettlementVerifier;
    }

    function recordVerifiedSettlement(
        bytes32 invoiceId,
        address payer,
        address vendor,
        uint256 amount,
        uint256 settledAt,
        bool onTime
    ) external onlySettlementVerifier {
        if (invoiceId == bytes32(0)) revert InvalidInvoiceId();
        if (payer == address(0)) revert InvalidPayer();
        if (vendor == address(0) || vendor == payer) revert InvalidVendor();
        if (amount == 0 || amount > type(uint128).max) revert InvalidAmount();
        if (settledAt == 0 || settledAt > type(uint64).max) {
            revert InvalidSettlementTimestamp();
        }
        if (processedInvoiceIds[invoiceId]) revert InvoiceAlreadyProcessed();

        processedInvoiceIds[invoiceId] = true;

        PayerMetrics storage payerMetrics = payerMetricsByAddress[payer];
        payerMetrics.settledInvoiceCount += 1;
        if (onTime) {
            payerMetrics.onTimeSettlementCount += 1;
        } else {
            payerMetrics.lateSettlementCount += 1;
        }
        payerMetrics.totalPaidUsdc += amount;
        payerMetrics.lastSettledAt = uint64(settledAt);
        payerMetrics.tier = _computeTier(payerMetrics);

        VendorMetrics storage vendorMetrics = vendorMetricsByAddress[vendor];
        vendorMetrics.settledInvoiceCount += 1;
        vendorMetrics.totalReceivedUsdc += amount;
        vendorMetrics.lastSettledAt = uint64(settledAt);

        emit PayerTrustUpdated(
            payer,
            invoiceId,
            payerMetrics.settledInvoiceCount,
            payerMetrics.onTimeSettlementCount,
            payerMetrics.lateSettlementCount,
            payerMetrics.totalPaidUsdc,
            payerMetrics.lastSettledAt,
            payerMetrics.tier
        );
        emit VendorActivityUpdated(
            vendor,
            invoiceId,
            vendorMetrics.settledInvoiceCount,
            vendorMetrics.totalReceivedUsdc,
            vendorMetrics.lastSettledAt
        );
    }

    function setSettlementVerifier(address newVerifier) external onlySettlementVerifier {
        if (newVerifier == address(0)) revert InvalidSettlementVerifier();

        address previousVerifier = settlementVerifier;
        settlementVerifier = newVerifier;
        emit SettlementVerifierUpdated(previousVerifier, newVerifier);
    }

    function getPayerMetrics(address payer) external view returns (PayerMetrics memory) {
        return payerMetricsByAddress[payer];
    }

    function getVendorMetrics(address vendor) external view returns (VendorMetrics memory) {
        return vendorMetricsByAddress[vendor];
    }

    function tierOf(address payer) external view returns (Tier) {
        return payerMetricsByAddress[payer].tier;
    }

    function _computeTier(PayerMetrics memory metrics) internal pure returns (Tier) {
        if (metrics.settledInvoiceCount == 0) return Tier.None;

        uint256 onTimeRateBps =
            (uint256(metrics.onTimeSettlementCount) * 10_000) /
            metrics.settledInvoiceCount;

        if (metrics.settledInvoiceCount >= 3 && onTimeRateBps < 6_000) {
            return Tier.Restricted;
        }
        if (
            metrics.settledInvoiceCount >= 20 &&
            onTimeRateBps >= 9_000 &&
            metrics.totalPaidUsdc >= 50_000 * USDC_UNIT
        ) {
            return Tier.Gold;
        }
        if (
            metrics.settledInvoiceCount >= 5 &&
            onTimeRateBps >= 8_000 &&
            metrics.totalPaidUsdc >= 5_000 * USDC_UNIT
        ) {
            return Tier.Silver;
        }
        return Tier.Bronze;
    }
}
