import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.create("hardhatMainnet");

const USDC = 1_000_000n;

async function deployRouter() {
  const [owner, buyer, vendor, outsider] = await ethers.getSigners();
  const token = await ethers.deployContract("MockUSDC");
  const router = await ethers.deployContract("SettlementRouter", [
    await token.getAddress(),
    owner.address
  ]);

  await token.mint(buyer.address, 10_000n * USDC);

  return { owner, buyer, vendor, outsider, token, router };
}

describe("SettlementRouter", function () {
  it("transfers USDC directly to the vendor and emits canonical payment evidence", async function () {
    const { buyer, vendor, token, router } = await deployRouter();
    const invoiceId = ethers.id("invoice-1");
    const amount = 750n * USDC;

    await token.connect(buyer).approve(await router.getAddress(), amount);
    const transaction = await router.connect(buyer).payInvoice(invoiceId, vendor.address, amount);
    const receipt = await transaction.wait();
    const block = await ethers.provider.getBlock(receipt!.blockNumber);

    await expect(transaction)
      .to.emit(router, "InvoicePaid")
      .withArgs(invoiceId, buyer.address, vendor.address, amount, BigInt(block!.timestamp));
    expect(await token.balanceOf(buyer.address)).to.equal(9_250n * USDC);
    expect(await token.balanceOf(vendor.address)).to.equal(amount);
    expect(await token.balanceOf(await router.getAddress())).to.equal(0n);
  });

  it("rejects invalid invoice payment fields", async function () {
    const { buyer, vendor, router } = await deployRouter();

    await expect(
      router.connect(buyer).payInvoice(ethers.ZeroHash, vendor.address, USDC)
    ).to.be.revertedWithCustomError(router, "InvalidInvoiceId");
    await expect(
      router.connect(buyer).payInvoice(ethers.id("invoice"), ethers.ZeroAddress, USDC)
    ).to.be.revertedWithCustomError(router, "InvalidVendor");
    await expect(
      router.connect(buyer).payInvoice(ethers.id("invoice"), vendor.address, 0n)
    ).to.be.revertedWithCustomError(router, "InvalidAmount");
    await expect(
      router
        .connect(buyer)
        .payInvoice(ethers.id("invoice"), vendor.address, (1n << 128n) + 1n)
    ).to.be.revertedWithCustomError(router, "AmountTooLarge");
    await expect(
      router.connect(buyer).payInvoice(ethers.id("invoice"), buyer.address, USDC)
    ).to.be.revertedWithCustomError(router, "SelfPayment");
  });

  it("reverts without sufficient buyer allowance and moves no funds", async function () {
    const { buyer, vendor, token, router } = await deployRouter();

    await expect(
      router.connect(buyer).payInvoice(ethers.id("invoice"), vendor.address, USDC)
    ).to.revert(ethers);
    expect(await token.balanceOf(vendor.address)).to.equal(0n);
    expect(await token.balanceOf(await router.getAddress())).to.equal(0n);
  });

  it("allows only the owner to pause and blocks payments while paused", async function () {
    const { owner, buyer, vendor, outsider, token, router } = await deployRouter();
    const invoiceId = ethers.id("invoice-paused");

    await expect(router.connect(outsider).pause())
      .to.be.revertedWithCustomError(router, "OwnableUnauthorizedAccount")
      .withArgs(outsider.address);

    await router.connect(owner).pause();
    await token.connect(buyer).approve(await router.getAddress(), USDC);
    await expect(router.connect(buyer).payInvoice(invoiceId, vendor.address, USDC))
      .to.be.revertedWithCustomError(router, "EnforcedPause");

    await router.connect(owner).unpause();
    await expect(router.connect(buyer).payInvoice(invoiceId, vendor.address, USDC)).to.emit(
      router,
      "InvoicePaid"
    );
  });

  it("uses two-step ownership transfer", async function () {
    const { owner, outsider, router } = await deployRouter();

    await router.connect(owner).transferOwnership(outsider.address);
    expect(await router.owner()).to.equal(owner.address);
    expect(await router.pendingOwner()).to.equal(outsider.address);

    await router.connect(outsider).acceptOwnership();
    expect(await router.owner()).to.equal(outsider.address);
    expect(await router.pendingOwner()).to.equal(ethers.ZeroAddress);
  });
});
