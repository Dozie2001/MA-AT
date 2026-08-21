import {
  createPublicClient,
  fallback,
  getAddress,
  http,
  parseAbi
} from "viem";
import type { Hex } from "viem";
import { sepolia } from "viem/chains";

import { buildBatchProof } from "./buildProof.js";
import { config } from "./config.js";
import { decodePaymentLog } from "./payment.js";
import { processSettlementBatch } from "./processSettlementBatch.js";
import { submitSettlementBatchToCreditcoin } from "./submitSettlementBatchToCreditcoin.js";

const invoiceRegistryAbi = parseAbi([
  "function getInvoice(bytes32 invoiceId) view returns ((address vendor, address buyer, uint128 amount, uint64 issuedAt, uint64 dueAt, uint64 settledAt, bytes32 metadataHash, uint8 status))"
]);

async function main(): Promise<void> {
  const transactionHashes = process.argv.slice(2) as Hex[];
  if (transactionHashes.length < 2 || transactionHashes.length > 10) {
    throw new Error(
      "Usage: npm run process-settlement-batch -- <sepolia_tx_hash_1> <sepolia_tx_hash_2> [...up to 10]"
    );
  }
  for (const txHash of transactionHashes) {
    if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
      throw new Error(`Invalid Sepolia transaction hash: ${txHash}`);
    }
  }
  if (!config.settlementRouterAddress) {
    throw new Error("Missing SETTLEMENT_ROUTER_ADDRESS in environment");
  }
  if (!config.invoiceRegistryAddress) {
    throw new Error("Missing INVOICE_REGISTRY_ADDRESS in environment");
  }

  const sepoliaTransports = config.sepoliaRpcUrls.map((url) =>
    http(url, { retryCount: 0 })
  );
  const sepoliaClient = createPublicClient({
    chain: sepolia,
    transport:
      sepoliaTransports.length === 1
        ? sepoliaTransports[0]
        : fallback(sepoliaTransports, { retryCount: 0 })
  });
  const creditcoinChain = {
    id: config.creditcoinChainId,
    name: "Creditcoin Testnet",
    nativeCurrency: { decimals: 18, name: "Creditcoin Testnet", symbol: "tCTC" },
    rpcUrls: { default: { http: [config.creditcoinRpcUrl] } }
  } as const;
  const creditcoinClient = createPublicClient({
    chain: creditcoinChain,
    transport: http(config.creditcoinRpcUrl)
  });
  const routerAddress = getAddress(config.settlementRouterAddress);
  const invoiceRegistryAddress = getAddress(config.invoiceRegistryAddress);

  const receipts = await Promise.all(
    transactionHashes.map((hash) => sepoliaClient.getTransactionReceipt({ hash }))
  );
  const payments = receipts.map((receipt, index) => {
    if (receipt.status !== "success") {
      throw new Error(`Sepolia transaction reverted: ${transactionHashes[index]}`);
    }
    const routerLogs = receipt.logs.filter(
      (entry) => entry.address.toLowerCase() === routerAddress.toLowerCase()
    );
    if (routerLogs.length !== 1) {
      throw new Error(
        `Expected exactly one SettlementRouter log in ${transactionHashes[index]}, found ${routerLogs.length}`
      );
    }
    return decodePaymentLog(routerLogs[0]);
  });

  const result = await processSettlementBatch(payments, {
    sourceChainKey: config.sepoliaChainKey,
    readInvoice: async (invoiceId) => {
      const invoice = await creditcoinClient.readContract({
        address: invoiceRegistryAddress,
        abi: invoiceRegistryAbi,
        functionName: "getInvoice",
        args: [invoiceId]
      });
      return {
        vendor: getAddress(invoice.vendor),
        buyer: getAddress(invoice.buyer),
        amount: invoice.amount,
        status: invoice.status
      };
    },
    buildProof: buildBatchProof,
    submitBatch: submitSettlementBatchToCreditcoin
  });

  if (result.kind === "rejected") {
    throw new Error(`Batch validation failed: ${JSON.stringify(result.failures)}`);
  }
  console.log(JSON.stringify(result, null, 2));
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
