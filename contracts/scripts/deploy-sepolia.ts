import { network } from "hardhat";

async function main(): Promise<void> {
  const { ethers } = await network.create("sepolia");

  const reporter = await ethers.deployContract("ExecutionReporter");
  await reporter.waitForDeployment();

  console.log(`ExecutionReporter=${await reporter.getAddress()}`);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
