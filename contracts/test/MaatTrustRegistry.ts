import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.create("hardhatMainnet");

const USDC = 1_000_000n;

async function deployTrustSystem() {
  const [, verifier, payer, vendor, outsider] = await ethers.getSigners();
  const trust = await ethers.deployContract("MaatTrustRegistry", [verifier.address]);
  const policy = await ethers.deployContract("MaatCreditPolicy", [await trust.getAddress()]);
  return { verifier, payer, vendor, outsider, trust, policy };
}

async function recordSettlements(
  trust: Awaited<ReturnType<typeof ethers.deployContract>>,
  verifier: Awaited<ReturnType<typeof ethers.getSigners>>[number],
  payer: string,
  vendor: string,
  count: number,
  lateIndexes: Set<number>,
  amount: bigint
) {
  for (let index = 0; index < count; index++) {
    await trust
      .connect(verifier)
      .recordVerifiedSettlement(
        ethers.id(`invoice-${count}-${index}`),
        payer,
        vendor,
        amount,
        1_700_000_000n + BigInt(index),
        !lateIndexes.has(index)
      );
  }
}

describe("MaatTrustRegistry and MaatCreditPolicy", function () {
  it("starts with no trust and no credit", async function () {
    const { payer, trust, policy } = await deployTrustSystem();

    expect(await trust.tierOf(payer.address)).to.equal(0n);
    expect(await policy.creditLimitUsdc(payer.address)).to.equal(0n);
    expect(await policy.canExtendTerms(payer.address, 1n)).to.equal(false);
  });

  it("records payer and vendor metrics and grants provisional Bronze", async function () {
    const { verifier, payer, vendor, trust, policy } = await deployTrustSystem();
    const invoiceId = ethers.id("first-settlement");
    const amount = 500n * USDC;
    const settledAt = 1_700_000_000n;

    await trust
      .connect(verifier)
      .recordVerifiedSettlement(
        invoiceId,
        payer.address,
        vendor.address,
        amount,
        settledAt,
        true
      );

    const payerMetrics = await trust.getPayerMetrics(payer.address);
    expect(payerMetrics.settledInvoiceCount).to.equal(1n);
    expect(payerMetrics.onTimeSettlementCount).to.equal(1n);
    expect(payerMetrics.lateSettlementCount).to.equal(0n);
    expect(payerMetrics.totalPaidUsdc).to.equal(amount);
    expect(payerMetrics.lastSettledAt).to.equal(settledAt);
    expect(payerMetrics.tier).to.equal(1n);

    const vendorMetrics = await trust.getVendorMetrics(vendor.address);
    expect(vendorMetrics.settledInvoiceCount).to.equal(1n);
    expect(vendorMetrics.totalReceivedUsdc).to.equal(amount);
    expect(vendorMetrics.lastSettledAt).to.equal(settledAt);

    expect(await policy.creditLimitUsdc(payer.address)).to.equal(1_000n * USDC);
    expect(await policy.canExtendTerms(payer.address, 750n * USDC)).to.equal(true);
    expect(await policy.canExtendTerms(payer.address, 1_001n * USDC)).to.equal(false);
  });

  it("grants Silver at the verified count, timeliness, and volume thresholds", async function () {
    const { verifier, payer, vendor, trust, policy } = await deployTrustSystem();

    await recordSettlements(
      trust,
      verifier,
      payer.address,
      vendor.address,
      5,
      new Set([4]),
      1_000n * USDC
    );

    expect(await trust.tierOf(payer.address)).to.equal(2n);
    expect(await policy.creditLimitUsdc(payer.address)).to.equal(10_000n * USDC);
  });

  it("grants Gold at the verified count, timeliness, and volume thresholds", async function () {
    const { verifier, payer, vendor, trust, policy } = await deployTrustSystem();

    await recordSettlements(
      trust,
      verifier,
      payer.address,
      vendor.address,
      20,
      new Set([18, 19]),
      2_500n * USDC
    );

    expect(await trust.tierOf(payer.address)).to.equal(3n);
    expect(await policy.creditLimitUsdc(payer.address)).to.equal(50_000n * USDC);
  });

  it("restricts a payer after enough evidence falls below the timeliness floor", async function () {
    const { verifier, payer, vendor, trust, policy } = await deployTrustSystem();

    await recordSettlements(
      trust,
      verifier,
      payer.address,
      vendor.address,
      3,
      new Set([0, 1]),
      1_000n * USDC
    );

    expect(await trust.tierOf(payer.address)).to.equal(4n);
    expect(await policy.creditLimitUsdc(payer.address)).to.equal(0n);
  });

  it("allows only the verifier and rejects invoice replay", async function () {
    const { verifier, payer, vendor, outsider, trust } = await deployTrustSystem();
    const invoiceId = ethers.id("replayed-invoice");

    await expect(
      trust
        .connect(outsider)
        .recordVerifiedSettlement(
          invoiceId,
          payer.address,
          vendor.address,
          USDC,
          1n,
          true
        )
    ).to.be.revertedWithCustomError(trust, "CallerIsNotSettlementVerifier");

    await trust
      .connect(verifier)
      .recordVerifiedSettlement(
        invoiceId,
        payer.address,
        vendor.address,
        USDC,
        1n,
        true
      );

    await expect(
      trust
        .connect(verifier)
        .recordVerifiedSettlement(
          invoiceId,
          payer.address,
          vendor.address,
          USDC,
          2n,
          true
        )
    ).to.be.revertedWithCustomError(trust, "InvoiceAlreadyProcessed");
  });

  it("rejects malformed settlement data", async function () {
    const { verifier, payer, vendor, trust } = await deployTrustSystem();
    const validId = ethers.id("valid-invoice");

    await expect(
      trust
        .connect(verifier)
        .recordVerifiedSettlement(
          ethers.ZeroHash,
          payer.address,
          vendor.address,
          USDC,
          1n,
          true
        )
    ).to.be.revertedWithCustomError(trust, "InvalidInvoiceId");
    await expect(
      trust
        .connect(verifier)
        .recordVerifiedSettlement(
          validId,
          ethers.ZeroAddress,
          vendor.address,
          USDC,
          1n,
          true
        )
    ).to.be.revertedWithCustomError(trust, "InvalidPayer");
    await expect(
      trust
        .connect(verifier)
        .recordVerifiedSettlement(
          validId,
          payer.address,
          payer.address,
          USDC,
          1n,
          true
        )
    ).to.be.revertedWithCustomError(trust, "InvalidVendor");
    await expect(
      trust
        .connect(verifier)
        .recordVerifiedSettlement(
          validId,
          payer.address,
          vendor.address,
          0n,
          1n,
          true
        )
    ).to.be.revertedWithCustomError(trust, "InvalidAmount");
    await expect(
      trust
        .connect(verifier)
        .recordVerifiedSettlement(
          validId,
          payer.address,
          vendor.address,
          USDC,
          0n,
          true
        )
    ).to.be.revertedWithCustomError(trust, "InvalidSettlementTimestamp");
  });
});
