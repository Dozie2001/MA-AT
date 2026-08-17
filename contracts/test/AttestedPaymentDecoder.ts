import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.create("hardhatMainnet");
const coder = ethers.AbiCoder.defaultAbiCoder();

const paymentEventSignature = ethers.id(
  "InvoicePaid(bytes32,address,address,uint256,uint256)"
);
const invoiceId = ethers.id("payment-decoder-invoice");
const amount = 750n * 1_000_000n;
const paidAt = 1_700_000_000n;

type EncodedPaymentOptions = {
  payer: string;
  vendor: string;
  router: string;
  destination?: string;
  emitter?: string;
  receiptStatus?: number;
  txType?: number;
  duplicateLog?: boolean;
  eventSignature?: string;
};

function encodeAttestedPayment(options: EncodedPaymentOptions) {
  const topics = [
    options.eventSignature ?? paymentEventSignature,
    invoiceId,
    ethers.zeroPadValue(options.payer, 32),
    ethers.zeroPadValue(options.vendor, 32)
  ];
  const data = coder.encode(["uint256", "uint256"], [amount, paidAt]);
  const paymentLog = [options.emitter ?? options.router, topics, data];
  const logs = options.duplicateLog ? [paymentLog, paymentLog] : [paymentLog];

  const commonFields = coder.encode(
    ["uint64", "uint64", "address", "bool", "address", "uint256", "bytes"],
    [0, 100_000, options.payer, false, options.destination ?? options.router, 0, "0x"]
  );
  const receiptFields = coder.encode(
    ["uint8", "uint64", "tuple(address,bytes32[],bytes)[]", "bytes"],
    [options.receiptStatus ?? 1, 50_000, logs, "0x"]
  );

  const txType = options.txType ?? 2;
  const chunks = txType <= 2
    ? [commonFields, "0x", receiptFields]
    : [commonFields, "0x", "0x", receiptFields];
  return coder.encode(["uint8", "bytes[]"], [txType, chunks]);
}

describe("AttestedPaymentDecoder", function () {
  it("derives all payment fields from a valid type-2 receipt", async function () {
    const [payer, vendor, router] = await ethers.getSigners();
    const harness = await ethers.deployContract("AttestedPaymentDecoderHarness");
    const encoded = encodeAttestedPayment({
      payer: payer.address,
      vendor: vendor.address,
      router: router.address
    });

    const decoded = await harness.decodePayment(encoded, router.address);
    expect(decoded.invoiceId).to.equal(invoiceId);
    expect(decoded.payer).to.equal(payer.address);
    expect(decoded.vendor).to.equal(vendor.address);
    expect(decoded.amount).to.equal(amount);
    expect(decoded.paidAt).to.equal(paidAt);
  });

  it("supports the four-chunk receipt position used by type-3 transactions", async function () {
    const [payer, vendor, router] = await ethers.getSigners();
    const harness = await ethers.deployContract("AttestedPaymentDecoderHarness");
    const encoded = encodeAttestedPayment({
      payer: payer.address,
      vendor: vendor.address,
      router: router.address,
      txType: 3
    });

    expect((await harness.decodePayment(encoded, router.address)).invoiceId).to.equal(invoiceId);
  });

  it("rejects a transaction sent to a different destination", async function () {
    const [payer, vendor, router, other] = await ethers.getSigners();
    const harness = await ethers.deployContract("AttestedPaymentDecoderHarness");
    const encoded = encodeAttestedPayment({
      payer: payer.address,
      vendor: vendor.address,
      router: router.address,
      destination: other.address
    });

    await expect(harness.decodePayment(encoded, router.address)).to.be.revertedWith(
      "unexpected transaction destination"
    );
  });

  it("rejects a failed source transaction", async function () {
    const [payer, vendor, router] = await ethers.getSigners();
    const harness = await ethers.deployContract("AttestedPaymentDecoderHarness");
    const encoded = encodeAttestedPayment({
      payer: payer.address,
      vendor: vendor.address,
      router: router.address,
      receiptStatus: 0
    });

    await expect(harness.decodePayment(encoded, router.address)).to.be.revertedWith(
      "source transaction failed"
    );
  });

  it("rejects a payment signature emitted by another contract", async function () {
    const [payer, vendor, router, other] = await ethers.getSigners();
    const harness = await ethers.deployContract("AttestedPaymentDecoderHarness");
    const encoded = encodeAttestedPayment({
      payer: payer.address,
      vendor: vendor.address,
      router: router.address,
      emitter: other.address
    });

    await expect(harness.decodePayment(encoded, router.address)).to.be.revertedWith(
      "expected exactly one payment event"
    );
  });

  it("rejects a wrong event signature or multiple matching events", async function () {
    const [payer, vendor, router] = await ethers.getSigners();
    const harness = await ethers.deployContract("AttestedPaymentDecoderHarness");
    const wrongSignature = encodeAttestedPayment({
      payer: payer.address,
      vendor: vendor.address,
      router: router.address,
      eventSignature: ethers.id("WrongEvent(bytes32,address,address,uint256,uint256)")
    });
    const duplicate = encodeAttestedPayment({
      payer: payer.address,
      vendor: vendor.address,
      router: router.address,
      duplicateLog: true
    });

    await expect(harness.decodePayment(wrongSignature, router.address)).to.be.revertedWith(
      "expected exactly one payment event"
    );
    await expect(harness.decodePayment(duplicate, router.address)).to.be.revertedWith(
      "expected exactly one payment event"
    );
  });
});
