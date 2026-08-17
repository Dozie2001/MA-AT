import "dotenv/config";

import { network } from "hardhat";
import { ethers } from "ethers";

function randomExecutionId(): string {
  return ethers.hexlify(ethers.randomBytes(32));
}

async function main(): Promise<void> {
  const executionReporterAddress = process.env.EXECUTION_REPORTER_ADDRESS;
  if (!executionReporterAddress) {
    throw new Error("Missing EXECUTION_REPORTER_ADDRESS in environment");
  }

  const { ethers: hardhatEthers } = await network.create("sepolia");
  const [deployer] = await hardhatEthers.getSigners();
  const reporter = await hardhatEthers.getContractAt(
    "ExecutionReporter",
    executionReporterAddress
  );

  const agent = process.env.AGENT_ADDRESS ?? deployer.address;
  if (!agent) {
    throw new Error("Missing AGENT_ADDRESS in environment");
  }

  const executionId = process.env.EXECUTION_ID ?? randomExecutionId();
  const success = (process.env.EXECUTION_SUCCESS ?? "true").toLowerCase() !== "false";
  const volume = BigInt(process.env.EXECUTION_VOLUME_WEI ?? ethers.parseEther("1000").toString());

  const tx = await reporter.reportExecution(agent, executionId, success, volume);
  const receipt = await tx.wait();

  console.log(`reportExecution tx=${tx.hash}`);
  console.log(`blockNumber=${receipt?.blockNumber}`);
  console.log(`agent=${agent}`);
  console.log(`executionId=${executionId}`);
  console.log(`success=${success}`);
  console.log(`volume=${volume.toString()}`);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
