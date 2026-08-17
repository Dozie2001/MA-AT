import { network } from "hardhat";
import { getAddress, Wallet } from "ethers";

async function main(): Promise<void> {
  const { ethers } = await network.create("creditcoinTestnet");
  const privateKey = process.env.CREDITCOIN_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("Missing CREDITCOIN_PRIVATE_KEY in environment");
  }
  const sourceReporter = process.env.EXECUTION_REPORTER_ADDRESS;
  if (!sourceReporter) {
    throw new Error("Missing EXECUTION_REPORTER_ADDRESS in environment");
  }
  const sourceChainKey = Number(process.env.ATTESTCOIN_CHAIN_KEY_SEPOLIA);
  if (!Number.isSafeInteger(sourceChainKey) || sourceChainKey < 0) {
    throw new Error("ATTESTCOIN_CHAIN_KEY_SEPOLIA must be a non-negative integer");
  }

  const deployer = new Wallet(privateKey, ethers.provider);
  const maatCoreFactory = await ethers.getContractFactory("MaatCore", deployer);
  const maatCore = await maatCoreFactory.deploy(deployer.address);
  await maatCore.waitForDeployment();

  const maatVerifierFactory = await ethers.getContractFactory("MaatVerifier", deployer);
  const maatVerifier = await maatVerifierFactory.deploy(
    await maatCore.getAddress(),
    sourceChainKey,
    getAddress(sourceReporter)
  );
  await maatVerifier.waitForDeployment();

  const setVerifierTx = await maatCore.setVerifier(await maatVerifier.getAddress());
  await setVerifierTx.wait();

  const maatPolicyFactory = await ethers.getContractFactory("MaatPolicy", deployer);
  const maatPolicy = await maatPolicyFactory.deploy(await maatCore.getAddress());
  await maatPolicy.waitForDeployment();

  console.log(`MaatCore=${await maatCore.getAddress()}`);
  console.log(`MaatVerifier=${await maatVerifier.getAddress()}`);
  console.log(`MaatPolicy=${await maatPolicy.getAddress()}`);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
