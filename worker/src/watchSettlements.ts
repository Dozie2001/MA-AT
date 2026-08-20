import { createPublicClient, fallback, getAddress, http, parseAbi } from "viem";
import type { Hex } from "viem";
import { sepolia } from "viem/chains";

import { buildProof } from "./buildProof.js";
import { config } from "./config.js";
import { loadCursor, saveCursor } from "./cursorStore.js";
import { decodePaymentLog, paymentEvent } from "./payment.js";
import type { InvoicePayment } from "./payment.js";
import { processSettlement } from "./processSettlement.js";
import {
  exponentialBackoffMs,
  isRateLimitError,
  safeErrorMessage,
} from "./rpcSafety.js";
import { SettlementQueue } from "./settlementQueue.js";
import { submitSettlementToCreditcoin } from "./submitSettlementToCreditcoin.js";

const invoiceRegistryAbi = parseAbi([
  "function getInvoice(bytes32 invoiceId) view returns ((address vendor, address buyer, uint128 amount, uint64 issuedAt, uint64 dueAt, uint64 settledAt, bytes32 metadataHash, uint8 status))"
]);

function requiredAddress(value: string | undefined, name: string) {
  if (!value) throw new Error(`Missing ${name} in environment`);
  return getAddress(value);
}

function log(
  level: "info" | "error",
  event: string,
  details: Record<string, unknown> = {}
) {
  const output = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event,
    ...details
  });
  if (level === "error") console.error(output);
  else console.log(output);
}

function paymentDetails(payment: InvoicePayment) {
  return {
    transactionHash: payment.transactionHash,
    blockNumber: payment.blockNumber.toString(),
    invoiceId: payment.invoiceId,
    payer: payment.payer,
    vendor: payment.vendor,
    amount: payment.amount.toString()
  };
}

function minBlock(left: bigint, right: bigint) {
  return left < right ? left : right;
}

function blockArgument(name: "--from-block" | "--to-block"): bigint | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  if (!value || !/^\d+$/.test(value)) {
    throw new Error(`${name} requires a non-negative integer block number`);
  }
  return BigInt(value);
}

async function wait(delayMs: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return;

  await new Promise<void>((resolve) => {
    const onAbort = () => {
      clearTimeout(timeout);
      resolve();
    };
    const timeout = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function main(): Promise<void> {
  const once = process.argv.includes("--once");
  const dryRun = process.argv.includes("--dry-run");
  const fromBlockOverride = blockArgument("--from-block");
  const toBlockOverride = blockArgument("--to-block");
  if ((fromBlockOverride !== undefined || toBlockOverride !== undefined) && !dryRun) {
    throw new Error("Block-range overrides are allowed only with --dry-run");
  }
  if (toBlockOverride !== undefined && !once) {
    throw new Error("--to-block requires --once");
  }
  if (
    fromBlockOverride !== undefined &&
    toBlockOverride !== undefined &&
    fromBlockOverride > toBlockOverride
  ) {
    throw new Error("--from-block cannot be greater than --to-block");
  }
  const routerAddress = requiredAddress(
    config.settlementRouterAddress,
    "SETTLEMENT_ROUTER_ADDRESS"
  );
  const invoiceRegistryAddress = requiredAddress(
    config.invoiceRegistryAddress,
    "INVOICE_REGISTRY_ADDRESS"
  );
  if (!dryRun && !process.env.CREDITCOIN_PRIVATE_KEY) {
    throw new Error("Missing CREDITCOIN_PRIVATE_KEY in environment");
  }

  const abortController = new AbortController();
  const stop = () => abortController.abort(new Error("Settlement worker stopped"));
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

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

  const queue = new SettlementQueue({
    retryDelayMs: config.settlementRetryIntervalMs,
    signal: abortController.signal,
    process: async (payment) => {
      const outcome = await processSettlement(
        payment,
        {
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
          buildProof: (request, signal) => buildProof(request, { signal }),
          submitSettlement: submitSettlementToCreditcoin,
          onStage: (stage, currentPayment) =>
            log("info", stage, paymentDetails(currentPayment))
        },
        { dryRun, signal: abortController.signal }
      );

      log("info", `payment-${outcome.kind}`, {
        ...paymentDetails(payment),
        ...(outcome.kind === "skipped" ? { reason: outcome.reason } : {}),
        ...(outcome.kind === "submitted"
          ? { creditcoinTxHash: outcome.creditcoinTxHash }
          : {})
      });
      return outcome;
    },
    onRetry: (payment, error) =>
      log("error", "payment-retry-scheduled", {
        ...paymentDetails(payment),
        retryDelayMs: config.settlementRetryIntervalMs,
        error: safeErrorMessage(error)
      })
  });

  const cursor = dryRun
    ? {
        nextBlock: fromBlockOverride ?? config.settlementRouterDeploymentBlock,
        restored: false
      }
    : await loadCursor({
        filePath: config.settlementCursorFile,
        chainId: sepolia.id,
        routerAddress,
        deploymentBlock: config.settlementRouterDeploymentBlock
      });
  let nextBlock = cursor.nextBlock;
  let scanChunkSize = config.settlementScanChunkSize;
  let consecutiveScanFailures = 0;
  let caughtUpLogged = false;

  log("info", "worker-started", {
    routerAddress,
    invoiceRegistryAddress,
    deploymentBlock: nextBlock.toString(),
    scanChunkSize: config.settlementScanChunkSize.toString(),
    scanIntervalMs: config.settlementScanIntervalMs,
    rpcEndpointCount: config.sepoliaRpcUrls.length,
    pollIntervalMs: config.settlementPollIntervalMs,
    sourceChainKey: config.sepoliaChainKey,
    toBlock: toBlockOverride?.toString() ?? null,
    cursorFile: dryRun ? null : config.settlementCursorFile,
    cursorRestored: cursor.restored,
    once,
    dryRun
  });

  while (!abortController.signal.aborted) {
    try {
      const networkLatestBlock = await sepoliaClient.getBlockNumber();
      const latestBlock =
        toBlockOverride === undefined
          ? networkLatestBlock
          : minBlock(toBlockOverride, networkLatestBlock);

      while (nextBlock <= latestBlock && !abortController.signal.aborted) {
        const toBlock = minBlock(nextBlock + scanChunkSize - 1n, latestBlock);
        let logs;
        try {
          logs = await sepoliaClient.getLogs({
            address: routerAddress,
            event: paymentEvent,
            fromBlock: nextBlock,
            toBlock
          });
        } catch (error) {
          if (isRateLimitError(error)) throw error;
          if (scanChunkSize > 1n) {
            const previousChunkSize = scanChunkSize;
            scanChunkSize = scanChunkSize / 2n;
            if (scanChunkSize < 1n) scanChunkSize = 1n;
            log("error", "scan-range-reduced", {
              previousChunkSize: previousChunkSize.toString(),
              nextChunkSize: scanChunkSize.toString(),
              error: safeErrorMessage(error)
            });
            continue;
          }
          throw error;
        }

        consecutiveScanFailures = 0;

        log("info", "range-scanned", {
          fromBlock: nextBlock.toString(),
          toBlock: toBlock.toString(),
          paymentsFound: logs.length
        });

        const rangeTasks: Array<Promise<unknown>> = [];
        for (const eventLog of logs) {
          let payment: InvoicePayment;
          try {
            payment = decodePaymentLog(eventLog);
          } catch (error) {
            log("error", "payment-log-rejected", {
              transactionHash: eventLog.transactionHash,
              error: safeErrorMessage(error)
            });
            continue;
          }

          log("info", "payment-detected", paymentDetails(payment));
          rangeTasks.push(queue.enqueue(payment));
        }

        await Promise.all(rangeTasks);
        nextBlock = toBlock + 1n;
        if (!dryRun) {
          await saveCursor({
            filePath: config.settlementCursorFile,
            chainId: sepolia.id,
            routerAddress,
            nextBlock
          });
        }
        if (nextBlock <= latestBlock) {
          await wait(config.settlementScanIntervalMs, abortController.signal);
        }
      }

      if (once) {
        await queue.drain();
        return;
      }

      if (!caughtUpLogged) {
        log("info", "worker-caught-up", {
          nextBlock: nextBlock.toString()
        });
        caughtUpLogged = true;
      }
      await wait(config.settlementPollIntervalMs, abortController.signal);
    } catch (error) {
      if (abortController.signal.aborted) break;
      consecutiveScanFailures += 1;
      const retryDelayMs = exponentialBackoffMs(
        config.settlementRetryIntervalMs,
        consecutiveScanFailures,
        config.settlementRetryMaxIntervalMs
      );
      log("error", "scan-retry-scheduled", {
        nextBlock: nextBlock.toString(),
        retryDelayMs,
        failureCount: consecutiveScanFailures,
        rateLimited: isRateLimitError(error),
        error: safeErrorMessage(error)
      });
      await wait(retryDelayMs, abortController.signal);
    }
  }

  await queue.drain();
  log("info", "worker-stopped");
}

void main().catch((error) => {
  log("error", "worker-failed", { error: safeErrorMessage(error) });
  process.exitCode = 1;
});
