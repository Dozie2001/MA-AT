// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AttestedPaymentDecoder} from "../AttestedPaymentDecoder.sol";

contract AttestedPaymentDecoderHarness {
    function decodePayment(
        bytes calldata encodedTransaction,
        address sourceRouter
    )
        external
        pure
        returns (
            bytes32 invoiceId,
            address payer,
            address vendor,
            uint256 amount,
            uint256 paidAt
        )
    {
        AttestedPaymentDecoder.Payment memory payment = AttestedPaymentDecoder.decode(
            encodedTransaction,
            sourceRouter
        );
        return (
            payment.invoiceId,
            payment.payer,
            payment.vendor,
            payment.amount,
            payment.paidAt
        );
    }
}
