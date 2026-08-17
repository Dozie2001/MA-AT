import { createPublicClient, decodeEventLog, getAddress, http, parseAbiItem } from "viem";
import { sepolia } from "viem/chains";

import { buildProof } from "./buildProof.js";
import { config } from "./config.js";
import { submitToCreditcoin } from "./submitToCreditcoin.js";

const executionEvent = parseAbiItem(
  "event AgentExecutionRecorded(address indexed agent, bytes32 indexed executionId, bool success, uint256 volume, uint256 timestamp)"
);

async function main(): Promise<void> {
  const txHash = process.argv[2] as `0x${string}` | undefined;
  if (!txHash) {
    throw new Error("Usage: npm run process-tx -- <sepolia_tx_hash>");
  }

  if (!config.executionReporterAddress) {
    throw new Error("Missing EXECUTION_REPORTER_ADDRESS in environment");
  }

  const client = createPublicClient({
    chain: sepolia,
    transport: http(config.sepoliaRpcUrl)
  });

  const receipt = await client.getTransactionReceipt({ hash: txHash });
  const targetAddress = getAddress(config.executionReporterAddress);
  const log = receipt.logs.find(
    (entry) => entry.address.toLowerCase() === targetAddress.toLowerCase()
  );

  if (!log) {
    throw new Error(`No ExecutionReporter log found in transaction ${txHash}`);
  }

  const decoded = decodeEventLog({
    abi: [executionEvent],
    data: log.data,
    topics: log.topics
  });

  const args = decoded.args as {
    agent: `0x${string}`;
    executionId: `0x${string}`;
    success: boolean;
    volume: bigint;
    timestamp: bigint;
  };

  const proof = await buildProof({
    txHash,
    chainKey: config.sepoliaChainKey,
    blockNumber: receipt.blockNumber
  });

  await submitToCreditcoin({
    agent: args.agent,
    executionId: args.executionId,
    success: args.success,
    volume: args.volume,
    observedAt: args.timestamp,
    proof
  });
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
