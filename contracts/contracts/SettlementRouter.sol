// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract SettlementRouter is Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    error InvalidUsdcAddress();
    error InvalidInvoiceId();
    error InvalidVendor();
    error InvalidAmount();
    error AmountTooLarge();
    error SelfPayment();

    IERC20 public immutable usdc;

    event InvoicePaid(
        bytes32 indexed invoiceId,
        address indexed payer,
        address indexed vendor,
        uint256 amount,
        uint256 paidAt
    );

    constructor(address usdcAddress, address initialOwner) Ownable(initialOwner) {
        if (usdcAddress == address(0)) revert InvalidUsdcAddress();
        usdc = IERC20(usdcAddress);
    }

    function payInvoice(
        bytes32 invoiceId,
        address vendor,
        uint256 amount
    ) external nonReentrant whenNotPaused {
        if (invoiceId == bytes32(0)) revert InvalidInvoiceId();
        if (vendor == address(0)) revert InvalidVendor();
        if (amount == 0) revert InvalidAmount();
        if (amount > type(uint128).max) revert AmountTooLarge();
        if (vendor == msg.sender) revert SelfPayment();

        usdc.safeTransferFrom(msg.sender, vendor, amount);

        emit InvoicePaid(invoiceId, msg.sender, vendor, amount, block.timestamp);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
