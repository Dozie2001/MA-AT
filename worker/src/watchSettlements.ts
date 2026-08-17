import {
  createPublicClient,
  decodeEventLog,
  getAddress,
  http,
  parseAbiItem
} from "viem";
import { sepolia } from "viem/chains";

import { buildProof } from "./buildProof.js";
import { config } from "./config.js";
import { submitSettlementToCreditcoin } from "./submitSettlementToCreditcoin.js";

const paymentEvent = parseAbiItem(
  "event InvoicePaid(bytes32 indexed invoiceId, address indexed payer, address indexed vendor, uint256 amount, uint256 paidAt)"
);

async function main(): Promise<void> {
  if (!config.settlementRouterAddress) {
    throw new Error("Missing SETTLEMENT_ROUTER_ADDRESS in environment");
  }

  const routerAddress = getAddress(config.settlementRouterAddress);
  const client = createPublicClient({
    chain: sepolia,
    transport: http(config.sepoliaRpcUrl)
  });

  console.log("Watching Sepolia for InvoicePaid");
  console.log("SettlementRouter:", routerAddress);

  const unwatch = client.watchContractEvent({
    address: routerAddress,
    abi: [paymentEvent],
    eventName: "InvoicePaid",
    onLogs: async (logs) => {
      for (const log of logs) {
        if (!log.transactionHash || log.blockNumber === null) continue;

        const decoded = decodeEventLog({
          abi: [paymentEvent],
          data: log.data,
          topics: log.topics
        });
        const args = decoded.args as {
          invoiceId: `0x${string}`;
          payer: `0x${string}`;
          vendor: `0x${string}`;
          amount: bigint;
          paidAt: bigint;
        };

        console.log("Detected Sepolia invoice payment", {
          txHash: log.transactionHash,
          blockNumber: log.blockNumber.toString(),
          invoiceId: args.invoiceId,
          payer: args.payer,
          vendor: args.vendor,
          amount: args.amount.toString()
        });

        const proof = await buildProof({
          txHash: log.transactionHash,
          chainKey: config.sepoliaChainKey,
          blockNumber: log.blockNumber
        });
        await submitSettlementToCreditcoin({ ...args, proof });
      }
    },
    onError: (error) => console.error("Sepolia settlement watcher error", error)
  });

  process.on("SIGINT", () => {
    unwatch();
    process.exit(0);
  });
}

void main();
