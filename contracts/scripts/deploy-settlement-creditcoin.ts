import { network } from "hardhat";
import { getAddress, Wallet } from "ethers";

const CREDITCOIN_TESTNET_CHAIN_ID = 102_031n;
const SEPOLIA_ATTESTCOIN_CHAIN_KEY = 1;
const VERIFIER_PRECOMPILE = getAddress(
  "0x0000000000000000000000000000000000000FD2"
);

async function main(): Promise<void> {
  const { ethers } = await network.create("creditcoinTestnet");
  const privateKey = process.env.CREDITCOIN_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("Missing CREDITCOIN_PRIVATE_KEY in environment");
  }

  const configuredChainId = Number(process.env.CREDITCOIN_CHAIN_ID);
  if (configuredChainId !== Number(CREDITCOIN_TESTNET_CHAIN_ID)) {
    throw new Error(
      `CREDITCOIN_CHAIN_ID must be ${CREDITCOIN_TESTNET_CHAIN_ID}, received ${configuredChainId}`
    );
  }

  const configuredSourceChainKey = Number(process.env.ATTESTCOIN_CHAIN_KEY_SEPOLIA);
  if (configuredSourceChainKey !== SEPOLIA_ATTESTCOIN_CHAIN_KEY) {
    throw new Error(
      `ATTESTCOIN_CHAIN_KEY_SEPOLIA must be ${SEPOLIA_ATTESTCOIN_CHAIN_KEY}, received ${configuredSourceChainKey}`
    );
  }

  const sourceRouterValue = process.env.SETTLEMENT_ROUTER_ADDRESS;
  if (!sourceRouterValue) {
    throw new Error("Missing SETTLEMENT_ROUTER_ADDRESS in environment");
  }
  const sourceRouter = getAddress(sourceRouterValue);

  const chainId = (await ethers.provider.getNetwork()).chainId;
  if (chainId !== CREDITCOIN_TESTNET_CHAIN_ID) {
    throw new Error(
      `Expected Creditcoin Testnet chain ID ${CREDITCOIN_TESTNET_CHAIN_ID}, received ${chainId}`
    );
  }
  const nativeVerifier = new ethers.Contract(
    VERIFIER_PRECOMPILE,
    [
      "function calculateTxIndex((bytes32 root,(bytes32 hash,bool isLeft)[] siblings) merkleProof) view returns (uint64)"
    ],
    ethers.provider
  );
  const precompileProbe = (await nativeVerifier.calculateTxIndex({
    root: `0x${"00".repeat(32)}`,
    siblings: []
  })) as bigint;
  if (precompileProbe !== 0n) {
    throw new Error(`Unexpected verifier precompile probe result ${precompileProbe}`);
  }

  const deployer = new Wallet(privateKey, ethers.provider);

  const registryFactory = await ethers.getContractFactory("InvoiceRegistry", deployer);
  const registry = await registryFactory.deploy(deployer.address);
  await registry.waitForDeployment();

  const trustFactory = await ethers.getContractFactory("MaatTrustRegistry", deployer);
  const trust = await trustFactory.deploy(deployer.address);
  await trust.waitForDeployment();

  const verifierFactory = await ethers.getContractFactory("MaatSettlementVerifier", deployer);
  const verifier = await verifierFactory.deploy(
    await registry.getAddress(),
    await trust.getAddress(),
    configuredSourceChainKey,
    sourceRouter
  );
  await verifier.waitForDeployment();

  const verifierAddress = await verifier.getAddress();
  await (await registry.setSettlementVerifier(verifierAddress)).wait();
  await (await trust.setSettlementVerifier(verifierAddress)).wait();

  const policyFactory = await ethers.getContractFactory("MaatCreditPolicy", deployer);
  const policy = await policyFactory.deploy(await trust.getAddress());
  await policy.waitForDeployment();

  if ((await registry.settlementVerifier()) !== verifierAddress) {
    throw new Error("InvoiceRegistry verifier handoff failed");
  }
  if ((await trust.settlementVerifier()) !== verifierAddress) {
    throw new Error("MaatTrustRegistry verifier handoff failed");
  }
  if ((await verifier.invoiceRegistry()) !== (await registry.getAddress())) {
    throw new Error("MaatSettlementVerifier registry binding mismatch");
  }
  if ((await verifier.trustRegistry()) !== (await trust.getAddress())) {
    throw new Error("MaatSettlementVerifier trust binding mismatch");
  }
  if ((await verifier.sourceRouter()) !== sourceRouter) {
    throw new Error("MaatSettlementVerifier source router binding mismatch");
  }

  console.log(`InvoiceRegistry=${await registry.getAddress()}`);
  console.log(`MaatTrustRegistry=${await trust.getAddress()}`);
  console.log(`MaatSettlementVerifier=${verifierAddress}`);
  console.log(`MaatCreditPolicy=${await policy.getAddress()}`);
  console.log(`SourceRouter=${sourceRouter}`);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
