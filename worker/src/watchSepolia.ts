import { decodeEventLog, getAddress, http, parseAbiItem, createPublicClient } from "viem";
import { sepolia } from "viem/chains";

import { buildProof } from "./buildProof.js";
import { config } from "./config.js";
import { submitToCreditcoin } from "./submitToCreditcoin.js";

const executionEvent = parseAbiItem(
  "event AgentExecutionRecorded(address indexed agent, bytes32 indexed executionId, bool success, uint256 volume, uint256 timestamp)"
);

async function main(): Promise<void> {
  if (!config.executionReporterAddress) {
    throw new Error("Missing EXECUTION_REPORTER_ADDRESS in environment");
  }

  const executionReporterAddress = getAddress(config.executionReporterAddress);

  const client = createPublicClient({
    chain: sepolia,
    transport: http(config.sepoliaRpcUrl)
  });

  console.log("Watching Sepolia for AgentExecutionRecorded");
  console.log("ExecutionReporter:", executionReporterAddress);

  const unwatch = client.watchContractEvent({
    address: executionReporterAddress,
    abi: [executionEvent],
    eventName: "AgentExecutionRecorded",
    onLogs: async (logs) => {
      for (const log of logs) {
        if (!log.transactionHash || log.blockNumber === null) {
          continue;
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

        console.log("Detected Sepolia execution", {
          txHash: log.transactionHash,
          blockNumber: log.blockNumber.toString(),
          agent: args.agent,
          executionId: args.executionId
        });

        const proof = await buildProof({
          txHash: log.transactionHash,
          chainKey: config.sepoliaChainKey,
          blockNumber: log.blockNumber
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
    },
    onError: (error) => {
      console.error("Sepolia watcher error", error);
    }
  });

  process.on("SIGINT", () => {
    unwatch();
    process.exit(0);
  });
}

void main();
