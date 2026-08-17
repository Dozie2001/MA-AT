import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.create("hardhatMainnet");

const USDC = 1_000_000n;

async function deployRegistry() {
  const [deployer, verifier, vendor, buyer, outsider] = await ethers.getSigners();
  const registry = await ethers.deployContract("InvoiceRegistry", [verifier.address]);
  return { deployer, verifier, vendor, buyer, outsider, registry };
}

async function futureTimestamp(seconds = 3_600) {
  const block = await ethers.provider.getBlock("latest");
  return BigInt(block!.timestamp + seconds);
}

async function createInvoice(
  registry: Awaited<ReturnType<typeof ethers.deployContract>>,
  vendor: Awaited<ReturnType<typeof ethers.getSigners>>[number],
  buyer: string,
  amount = 500n * USDC,
  dueAt?: bigint
) {
  const due = dueAt ?? (await futureTimestamp());
  const metadataHash = ethers.id("invoice-metadata");
  const invoiceId = await registry
    .connect(vendor)
    .createInvoice.staticCall(buyer, amount, due, metadataHash);
  const transaction = await registry
    .connect(vendor)
    .createInvoice(buyer, amount, due, metadataHash);
  return { invoiceId, amount, dueAt: due, metadataHash, transaction };
}

describe("InvoiceRegistry", function () {
  it("creates a unique open invoice with the exact vendor terms", async function () {
    const { vendor, buyer, registry } = await deployRegistry();
    const first = await createInvoice(registry, vendor, buyer.address);
    const second = await createInvoice(registry, vendor, buyer.address);

    expect(first.invoiceId).to.not.equal(second.invoiceId);
    expect(await registry.vendorNonces(vendor.address)).to.equal(2n);

    const invoice = await registry.getInvoice(first.invoiceId);
    expect(invoice.vendor).to.equal(vendor.address);
    expect(invoice.buyer).to.equal(buyer.address);
    expect(invoice.amount).to.equal(first.amount);
    expect(invoice.dueAt).to.equal(first.dueAt);
    expect(invoice.settledAt).to.equal(0n);
    expect(invoice.metadataHash).to.equal(first.metadataHash);
    expect(invoice.status).to.equal(1n);

    await expect(first.transaction)
      .to.emit(registry, "InvoiceCreated")
      .withArgs(
        first.invoiceId,
        vendor.address,
        buyer.address,
        first.amount,
        invoice.issuedAt,
        first.dueAt,
        first.metadataHash
      );
  });

  it("rejects invalid invoice terms", async function () {
    const { vendor, buyer, registry } = await deployRegistry();
    const dueAt = await futureTimestamp();
    const currentBlock = await ethers.provider.getBlock("latest");

    await expect(
      registry.connect(vendor).createInvoice(ethers.ZeroAddress, USDC, dueAt, ethers.ZeroHash)
    ).to.be.revertedWithCustomError(registry, "InvalidBuyer");
    await expect(
      registry.connect(vendor).createInvoice(vendor.address, USDC, dueAt, ethers.ZeroHash)
    ).to.be.revertedWithCustomError(registry, "InvalidBuyer");
    await expect(
      registry.connect(vendor).createInvoice(buyer.address, 0n, dueAt, ethers.ZeroHash)
    ).to.be.revertedWithCustomError(registry, "InvalidAmount");
    await expect(
      registry
        .connect(vendor)
        .createInvoice(buyer.address, USDC, currentBlock!.timestamp, ethers.ZeroHash)
    ).to.be.revertedWithCustomError(registry, "InvalidDueDate");
  });

  it("allows only the vendor to cancel an open invoice", async function () {
    const { vendor, buyer, outsider, registry } = await deployRegistry();
    const { invoiceId } = await createInvoice(registry, vendor, buyer.address);

    await expect(registry.connect(outsider).cancelInvoice(invoiceId)).to.be.revertedWithCustomError(
      registry,
      "CallerIsNotVendor"
    );
    await expect(registry.connect(vendor).cancelInvoice(invoiceId))
      .to.emit(registry, "InvoiceCancelled")
      .withArgs(invoiceId, vendor.address);
    expect((await registry.getInvoice(invoiceId)).status).to.equal(3n);
    await expect(registry.connect(vendor).cancelInvoice(invoiceId)).to.be.revertedWithCustomError(
      registry,
      "InvoiceIsNotOpen"
    );
  });

  it("settles an exact on-time payment once", async function () {
    const { verifier, vendor, buyer, registry } = await deployRegistry();
    const { invoiceId, amount, dueAt } = await createInvoice(registry, vendor, buyer.address);
    const paidAt = dueAt - 60n;

    expect(
      await registry
        .connect(verifier)
        .settleVerifiedPayment.staticCall(
          invoiceId,
          buyer.address,
          vendor.address,
          amount,
          paidAt
        )
    ).to.equal(true);

    await expect(
      registry
        .connect(verifier)
        .settleVerifiedPayment(invoiceId, buyer.address, vendor.address, amount, paidAt)
    )
      .to.emit(registry, "InvoiceSettled")
      .withArgs(invoiceId, buyer.address, vendor.address, amount, paidAt, true);

    const invoice = await registry.getInvoice(invoiceId);
    expect(invoice.status).to.equal(2n);
    expect(invoice.settledAt).to.equal(paidAt);

    await expect(
      registry
        .connect(verifier)
        .settleVerifiedPayment(invoiceId, buyer.address, vendor.address, amount, paidAt)
    ).to.be.revertedWithCustomError(registry, "InvoiceIsNotOpen");
  });

  it("returns false for a valid late settlement", async function () {
    const { verifier, vendor, buyer, registry } = await deployRegistry();
    const { invoiceId, amount, dueAt } = await createInvoice(registry, vendor, buyer.address);

    expect(
      await registry
        .connect(verifier)
        .settleVerifiedPayment.staticCall(
          invoiceId,
          buyer.address,
          vendor.address,
          amount,
          dueAt + 1n
        )
    ).to.equal(false);
  });

  it("allows only the verifier and rejects every reconciliation mismatch", async function () {
    const { verifier, vendor, buyer, outsider, registry } = await deployRegistry();
    const { invoiceId, amount, dueAt } = await createInvoice(registry, vendor, buyer.address);

    await expect(
      registry
        .connect(outsider)
        .settleVerifiedPayment(invoiceId, buyer.address, vendor.address, amount, dueAt)
    ).to.be.revertedWithCustomError(registry, "CallerIsNotSettlementVerifier");
    await expect(
      registry
        .connect(verifier)
        .settleVerifiedPayment(invoiceId, outsider.address, vendor.address, amount, dueAt)
    ).to.be.revertedWithCustomError(registry, "PayerDoesNotMatchBuyer");
    await expect(
      registry
        .connect(verifier)
        .settleVerifiedPayment(invoiceId, buyer.address, outsider.address, amount, dueAt)
    ).to.be.revertedWithCustomError(registry, "VendorDoesNotMatchInvoice");
    await expect(
      registry
        .connect(verifier)
        .settleVerifiedPayment(invoiceId, buyer.address, vendor.address, amount + 1n, dueAt)
    ).to.be.revertedWithCustomError(registry, "AmountDoesNotMatchInvoice");
    await expect(
      registry
        .connect(verifier)
        .settleVerifiedPayment(invoiceId, buyer.address, vendor.address, amount, 0n)
    ).to.be.revertedWithCustomError(registry, "InvalidPaymentTimestamp");
  });

  it("supports a one-time verifier handoff", async function () {
    const { verifier, outsider, registry } = await deployRegistry();

    await expect(registry.connect(verifier).setSettlementVerifier(outsider.address))
      .to.emit(registry, "SettlementVerifierUpdated")
      .withArgs(verifier.address, outsider.address);
    expect(await registry.settlementVerifier()).to.equal(outsider.address);

    await expect(
      registry.connect(verifier).setSettlementVerifier(verifier.address)
    ).to.be.revertedWithCustomError(registry, "CallerIsNotSettlementVerifier");
  });
});
