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
  const txHash = process.argv[2] as `0x${string}` | undefined;
  if (!txHash) {
    throw new Error("Usage: npm run process-settlement -- <sepolia_tx_hash>");
  }
  if (!config.settlementRouterAddress) {
    throw new Error("Missing SETTLEMENT_ROUTER_ADDRESS in environment");
  }

  const client = createPublicClient({
    chain: sepolia,
    transport: http(config.sepoliaRpcUrl)
  });
  const receipt = await client.getTransactionReceipt({ hash: txHash });
  const routerAddress = getAddress(config.settlementRouterAddress);
  const routerLogs = receipt.logs.filter(
    (entry) => entry.address.toLowerCase() === routerAddress.toLowerCase()
  );

  if (routerLogs.length !== 1) {
    throw new Error(
      `Expected exactly one SettlementRouter log in ${txHash}, found ${routerLogs.length}`
    );
  }

  const decoded = decodeEventLog({
    abi: [paymentEvent],
    data: routerLogs[0].data,
    topics: routerLogs[0].topics
  });
  const args = decoded.args as {
    invoiceId: `0x${string}`;
    payer: `0x${string}`;
    vendor: `0x${string}`;
    amount: bigint;
    paidAt: bigint;
  };

  const proof = await buildProof({
    txHash,
    chainKey: config.sepoliaChainKey,
    blockNumber: receipt.blockNumber
  });

  await submitSettlementToCreditcoin({ ...args, proof });
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
