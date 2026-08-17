// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract InvoiceRegistry {
    enum InvoiceStatus {
        None,
        Created,
        Settled,
        Cancelled
    }

    struct Invoice {
        address vendor;
        address buyer;
        uint128 amount;
        uint64 issuedAt;
        uint64 dueAt;
        uint64 settledAt;
        bytes32 metadataHash;
        InvoiceStatus status;
    }

    error CallerIsNotSettlementVerifier();
    error InvalidSettlementVerifier();
    error InvalidBuyer();
    error InvalidAmount();
    error InvalidDueDate();
    error InvoiceDoesNotExist();
    error InvoiceIsNotOpen();
    error CallerIsNotVendor();
    error PayerDoesNotMatchBuyer();
    error VendorDoesNotMatchInvoice();
    error AmountDoesNotMatchInvoice();
    error InvalidPaymentTimestamp();

    mapping(bytes32 => Invoice) private invoices;
    mapping(address => uint64) public vendorNonces;
    address public settlementVerifier;

    event InvoiceCreated(
        bytes32 indexed invoiceId,
        address indexed vendor,
        address indexed buyer,
        uint256 amount,
        uint256 issuedAt,
        uint256 dueAt,
        bytes32 metadataHash
    );
    event InvoiceCancelled(bytes32 indexed invoiceId, address indexed vendor);
    event InvoiceSettled(
        bytes32 indexed invoiceId,
        address indexed payer,
        address indexed vendor,
        uint256 amount,
        uint256 paidAt,
        bool onTime
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

    function createInvoice(
        address buyer,
        uint128 amount,
        uint64 dueAt,
        bytes32 metadataHash
    ) external returns (bytes32 invoiceId) {
        if (buyer == address(0) || buyer == msg.sender) revert InvalidBuyer();
        if (amount == 0) revert InvalidAmount();
        if (dueAt <= block.timestamp) revert InvalidDueDate();

        uint64 nonce = vendorNonces[msg.sender];
        vendorNonces[msg.sender] = nonce + 1;
        invoiceId = keccak256(
            abi.encode(address(this), block.chainid, msg.sender, buyer, nonce)
        );

        uint64 issuedAt = uint64(block.timestamp);
        invoices[invoiceId] = Invoice({
            vendor: msg.sender,
            buyer: buyer,
            amount: amount,
            issuedAt: issuedAt,
            dueAt: dueAt,
            settledAt: 0,
            metadataHash: metadataHash,
            status: InvoiceStatus.Created
        });

        emit InvoiceCreated(
            invoiceId,
            msg.sender,
            buyer,
            amount,
            issuedAt,
            dueAt,
            metadataHash
        );
    }

    function cancelInvoice(bytes32 invoiceId) external {
        Invoice storage invoice = invoices[invoiceId];
        if (invoice.status == InvoiceStatus.None) revert InvoiceDoesNotExist();
        if (invoice.status != InvoiceStatus.Created) revert InvoiceIsNotOpen();
        if (msg.sender != invoice.vendor) revert CallerIsNotVendor();

        invoice.status = InvoiceStatus.Cancelled;
        emit InvoiceCancelled(invoiceId, msg.sender);
    }

    function settleVerifiedPayment(
        bytes32 invoiceId,
        address payer,
        address vendor,
        uint256 amount,
        uint256 paidAt
    ) external onlySettlementVerifier returns (bool onTime) {
        Invoice storage invoice = invoices[invoiceId];
        if (invoice.status == InvoiceStatus.None) revert InvoiceDoesNotExist();
        if (invoice.status != InvoiceStatus.Created) revert InvoiceIsNotOpen();
        if (payer != invoice.buyer) revert PayerDoesNotMatchBuyer();
        if (vendor != invoice.vendor) revert VendorDoesNotMatchInvoice();
        if (amount != invoice.amount) revert AmountDoesNotMatchInvoice();
        if (paidAt == 0 || paidAt > type(uint64).max) revert InvalidPaymentTimestamp();

        invoice.settledAt = uint64(paidAt);
        invoice.status = InvoiceStatus.Settled;
        onTime = paidAt <= invoice.dueAt;

        emit InvoiceSettled(invoiceId, payer, vendor, amount, paidAt, onTime);
    }

    function setSettlementVerifier(address newVerifier) external onlySettlementVerifier {
        if (newVerifier == address(0)) revert InvalidSettlementVerifier();

        address previousVerifier = settlementVerifier;
        settlementVerifier = newVerifier;
        emit SettlementVerifierUpdated(previousVerifier, newVerifier);
    }

    function getInvoice(bytes32 invoiceId) external view returns (Invoice memory) {
        return invoices[invoiceId];
    }
}
