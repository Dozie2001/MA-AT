import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.create("hardhatMainnet");
const coder = ethers.AbiCoder.defaultAbiCoder();

const PRECOMPILE = "0x0000000000000000000000000000000000000FD2";
const CHAIN_KEY = 1n;
const HEIGHT = 11_508_158n;
const TX_INDEX = 88n;
const USDC = 1_000_000n;
const paymentEventSignature = ethers.id(
  "InvoicePaid(bytes32,address,address,uint256,uint256)"
);

async function installMockPrecompile() {
  const mock = await ethers.deployContract("MockAttestcoinQueryVerifier");
  const runtimeCode = await ethers.provider.getCode(await mock.getAddress());
  await ethers.provider.send("hardhat_setCode", [PRECOMPILE, runtimeCode]);
}

function encodeAttestedPayment(
  invoiceId: string,
  payer: string,
  vendor: string,
  router: string,
  amount: bigint,
  paidAt: bigint
) {
  const paymentLog = [
    router,
    [
      paymentEventSignature,
      invoiceId,
      ethers.zeroPadValue(payer, 32),
      ethers.zeroPadValue(vendor, 32)
    ],
    coder.encode(["uint256", "uint256"], [amount, paidAt])
  ];
  const commonFields = coder.encode(
    ["uint64", "uint64", "address", "bool", "address", "uint256", "bytes"],
    [0, 100_000, payer, false, router, 0, "0x"]
  );
  const receiptFields = coder.encode(
    ["uint8", "uint64", "tuple(address,bytes32[],bytes)[]", "bytes"],
    [1, 50_000, [paymentLog], "0x"]
  );
  return coder.encode(
    ["uint8", "bytes[]"],
    [2, [commonFields, "0x", receiptFields]]
  );
}

async function deploySettlementSystem() {
  const [deployer, payer, vendor, router, outsider] = await ethers.getSigners();
  await installMockPrecompile();

  const invoiceRegistry = await ethers.deployContract("InvoiceRegistry", [deployer.address]);
  const trustRegistry = await ethers.deployContract("MaatTrustRegistry", [deployer.address]);
  const creditPolicy = await ethers.deployContract("MaatCreditPolicy", [
    await trustRegistry.getAddress()
  ]);
  const verifier = await ethers.deployContract("MaatSettlementVerifier", [
    await invoiceRegistry.getAddress(),
    await trustRegistry.getAddress(),
    CHAIN_KEY,
    router.address
  ]);

  await invoiceRegistry.setSettlementVerifier(await verifier.getAddress());
  await trustRegistry.setSettlementVerifier(await verifier.getAddress());

  return {
    payer,
    vendor,
    router,
    outsider,
    invoiceRegistry,
    trustRegistry,
    creditPolicy,
    verifier
  };
}

async function createInvoice(
  invoiceRegistry: Awaited<ReturnType<typeof ethers.deployContract>>,
  vendor: Awaited<ReturnType<typeof ethers.getSigners>>[number],
  payer: string,
  amount: bigint
) {
  const block = await ethers.provider.getBlock("latest");
  const dueAt = BigInt(block!.timestamp + 3_600);
  const invoiceId = await invoiceRegistry
    .connect(vendor)
    .createInvoice.staticCall(payer, amount, dueAt, ethers.id("verified-invoice"));
  await invoiceRegistry
    .connect(vendor)
    .createInvoice(payer, amount, dueAt, ethers.id("verified-invoice"));
  return { invoiceId, dueAt };
}

function validProof(root = ethers.ZeroHash) {
  return {
    merkleProof: { root, siblings: [] },
    continuityProof: { lowerEndpointDigest: ethers.ZeroHash, roots: [ethers.ZeroHash] }
  };
}

describe("MaatSettlementVerifier", function () {
  it("atomically settles a proved invoice and updates trust and credit policy", async function () {
    const {
      payer,
      vendor,
      router,
      invoiceRegistry,
      trustRegistry,
      creditPolicy,
      verifier
    } = await deploySettlementSystem();
    const amount = 750n * USDC;
    const { invoiceId, dueAt } = await createInvoice(
      invoiceRegistry,
      vendor,
      payer.address,
      amount
    );
    const paidAt = dueAt - 60n;
    const encoded = encodeAttestedPayment(
      invoiceId,
      payer.address,
      vendor.address,
      router.address,
      amount,
      paidAt
    );
    const proof = validProof();

    await expect(
      verifier.submitVerifiedSettlement(
        CHAIN_KEY,
        HEIGHT,
        encoded,
        proof.merkleProof,
        proof.continuityProof
      )
    )
      .to.emit(verifier, "SettlementProofAccepted")
      .withArgs(
        CHAIN_KEY,
        HEIGHT,
        TX_INDEX,
        invoiceId,
        payer.address,
        vendor.address,
        amount,
        paidAt,
        true
      );

    const invoice = await invoiceRegistry.getInvoice(invoiceId);
    expect(invoice.status).to.equal(2n);
    expect(invoice.settledAt).to.equal(paidAt);
    expect((await trustRegistry.getPayerMetrics(payer.address)).tier).to.equal(1n);
    expect((await trustRegistry.getVendorMetrics(vendor.address)).totalReceivedUsdc).to.equal(
      amount
    );
    expect(await creditPolicy.creditLimitUsdc(payer.address)).to.equal(1_000n * USDC);

    const queryKey = ethers.solidityPackedKeccak256(
      ["uint64", "uint64", "uint64"],
      [CHAIN_KEY, HEIGHT, TX_INDEX]
    );
    expect(await verifier.processedQueries(queryKey)).to.equal(true);
  });

  it("rejects an unexpected source chain before verification", async function () {
    const { verifier } = await deploySettlementSystem();
    const proof = validProof();

    await expect(
      verifier.submitVerifiedSettlement(
        2n,
        HEIGHT,
        "0x",
        proof.merkleProof,
        proof.continuityProof
      )
    ).to.be.revertedWithCustomError(verifier, "UnexpectedSourceChain");
  });

  it("rejects a failed Attestcoin proof", async function () {
    const { verifier } = await deploySettlementSystem();
    const failedRoot = ethers.zeroPadValue("0x01", 32);
    const proof = validProof(failedRoot);

    await expect(
      verifier.submitVerifiedSettlement(
        CHAIN_KEY,
        HEIGHT,
        "0x1234",
        proof.merkleProof,
        proof.continuityProof
      )
    ).to.be.revertedWithCustomError(verifier, "ProofVerificationFailed");
  });

  it("rolls back the query marker when proved payment fields do not match the invoice", async function () {
    const { payer, vendor, router, invoiceRegistry, trustRegistry, verifier } =
      await deploySettlementSystem();
    const amount = 750n * USDC;
    const { invoiceId, dueAt } = await createInvoice(
      invoiceRegistry,
      vendor,
      payer.address,
      amount
    );
    const encoded = encodeAttestedPayment(
      invoiceId,
      payer.address,
      vendor.address,
      router.address,
      amount + 1n,
      dueAt - 1n
    );
    const proof = validProof();

    await expect(
      verifier.submitVerifiedSettlement(
        CHAIN_KEY,
        HEIGHT,
        encoded,
        proof.merkleProof,
        proof.continuityProof
      )
    ).to.be.revertedWithCustomError(invoiceRegistry, "AmountDoesNotMatchInvoice");

    const queryKey = ethers.solidityPackedKeccak256(
      ["uint64", "uint64", "uint64"],
      [CHAIN_KEY, HEIGHT, TX_INDEX]
    );
    expect(await verifier.processedQueries(queryKey)).to.equal(false);
    expect((await invoiceRegistry.getInvoice(invoiceId)).status).to.equal(1n);
    expect((await trustRegistry.getPayerMetrics(payer.address)).settledInvoiceCount).to.equal(0n);
  });

  it("rejects replaying an accepted source query", async function () {
    const { payer, vendor, router, invoiceRegistry, verifier } = await deploySettlementSystem();
    const amount = 750n * USDC;
    const { invoiceId, dueAt } = await createInvoice(
      invoiceRegistry,
      vendor,
      payer.address,
      amount
    );
    const encoded = encodeAttestedPayment(
      invoiceId,
      payer.address,
      vendor.address,
      router.address,
      amount,
      dueAt - 1n
    );
    const proof = validProof();

    await verifier.submitVerifiedSettlement(
      CHAIN_KEY,
      HEIGHT,
      encoded,
      proof.merkleProof,
      proof.continuityProof
    );
    await expect(
      verifier.submitVerifiedSettlement(
        CHAIN_KEY,
        HEIGHT,
        encoded,
        proof.merkleProof,
        proof.continuityProof
      )
    ).to.be.revertedWithCustomError(verifier, "QueryAlreadyProcessed");
  });
});
