import { getAddress, Wallet } from "ethers";
import { network } from "hardhat";

const CREDITCOIN_TESTNET_CHAIN_ID = 102_031n;
const SEPOLIA_ATTESTCOIN_CHAIN_KEY = 1;

async function main(): Promise<void> {
  const invoiceRegistryValue = process.argv[2];
  const trustRegistryValue = process.argv[3];
  if (!invoiceRegistryValue || !trustRegistryValue) {
    throw new Error(
      "Usage: npm run resume:settlement:creditcoin -- <invoice-registry> <trust-registry>"
    );
  }

  const privateKey = process.env.CREDITCOIN_PRIVATE_KEY;
  if (!privateKey) throw new Error("Missing CREDITCOIN_PRIVATE_KEY in environment");
  const sourceRouterValue = process.env.SETTLEMENT_ROUTER_ADDRESS;
  if (!sourceRouterValue) {
    throw new Error("Missing SETTLEMENT_ROUTER_ADDRESS in environment");
  }

  const configuredChainId = Number(process.env.CREDITCOIN_CHAIN_ID);
  if (configuredChainId !== Number(CREDITCOIN_TESTNET_CHAIN_ID)) {
    throw new Error(`CREDITCOIN_CHAIN_ID must be ${CREDITCOIN_TESTNET_CHAIN_ID}`);
  }
  const sourceChainKey = Number(process.env.ATTESTCOIN_CHAIN_KEY_SEPOLIA);
  if (sourceChainKey !== SEPOLIA_ATTESTCOIN_CHAIN_KEY) {
    throw new Error(
      `ATTESTCOIN_CHAIN_KEY_SEPOLIA must be ${SEPOLIA_ATTESTCOIN_CHAIN_KEY}`
    );
  }

  const { ethers } = await network.create("creditcoinTestnet");
  const chainId = (await ethers.provider.getNetwork()).chainId;
  if (chainId !== CREDITCOIN_TESTNET_CHAIN_ID) {
    throw new Error(`Expected Creditcoin Testnet, received chain ID ${chainId}`);
  }

  const deployer = new Wallet(privateKey, ethers.provider);
  const invoiceRegistryAddress = getAddress(invoiceRegistryValue);
  const trustRegistryAddress = getAddress(trustRegistryValue);
  const sourceRouter = getAddress(sourceRouterValue);
  for (const [label, address] of [
    ["InvoiceRegistry", invoiceRegistryAddress],
    ["MaatTrustRegistry", trustRegistryAddress]
  ] as const) {
    if ((await ethers.provider.getCode(address)) === "0x") {
      throw new Error(`No deployed bytecode for ${label} at ${address}`);
    }
  }

  const registry = await ethers.getContractAt(
    "InvoiceRegistry",
    invoiceRegistryAddress,
    deployer
  );
  const trust = await ethers.getContractAt(
    "MaatTrustRegistry",
    trustRegistryAddress,
    deployer
  );
  if ((await registry.settlementVerifier()) !== deployer.address) {
    throw new Error("InvoiceRegistry is not awaiting handoff from this deployer");
  }
  if ((await trust.settlementVerifier()) !== deployer.address) {
    throw new Error("MaatTrustRegistry is not awaiting handoff from this deployer");
  }

  const verifierFactory = await ethers.getContractFactory(
    "MaatSettlementVerifier",
    deployer
  );
  const verifier = await verifierFactory.deploy(
    invoiceRegistryAddress,
    trustRegistryAddress,
    sourceChainKey,
    sourceRouter
  );
  const verifierDeploymentHash = verifier.deploymentTransaction()?.hash;
  await verifier.waitForDeployment();
  const verifierAddress = await verifier.getAddress();

  const registryHandoff = await registry.setSettlementVerifier(verifierAddress);
  const registryHandoffReceipt = await registryHandoff.wait();
  const trustHandoff = await trust.setSettlementVerifier(verifierAddress);
  const trustHandoffReceipt = await trustHandoff.wait();

  const policyFactory = await ethers.getContractFactory("MaatCreditPolicy", deployer);
  const policy = await policyFactory.deploy(trustRegistryAddress);
  const policyDeploymentHash = policy.deploymentTransaction()?.hash;
  await policy.waitForDeployment();
  const policyAddress = await policy.getAddress();

  if (
    (await registry.settlementVerifier()) !== verifierAddress ||
    (await trust.settlementVerifier()) !== verifierAddress ||
    (await verifier.invoiceRegistry()) !== invoiceRegistryAddress ||
    (await verifier.trustRegistry()) !== trustRegistryAddress ||
    (await verifier.sourceChainKey()) !== BigInt(sourceChainKey) ||
    (await verifier.sourceRouter()) !== sourceRouter ||
    (await verifier.MAX_BATCH_SIZE()) !== 10n ||
    (await policy.trustRegistry()) !== trustRegistryAddress
  ) {
    throw new Error("Completed deployment bindings did not verify");
  }

  console.log(
    JSON.stringify(
      {
        invoiceRegistry: invoiceRegistryAddress,
        trustRegistry: trustRegistryAddress,
        settlementVerifier: verifierAddress,
        creditPolicy: policyAddress,
        sourceRouter,
        maxBatchSize: "10",
        transactions: {
          verifierDeployment: verifierDeploymentHash,
          registryHandoff: registryHandoffReceipt?.hash,
          trustHandoff: trustHandoffReceipt?.hash,
          policyDeployment: policyDeploymentHash
        }
      },
      null,
      2
    )
  );
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
