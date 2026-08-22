import type { Hex } from "viem";

import type { BatchProof, PendingProofRequest } from "./buildProof.js";
import type { InvoicePayment } from "./payment.js";
import {
  validatePaymentAgainstInvoice,
  type InvoiceSnapshot,
  type SettlementSkipReason
} from "./processSettlement.js";

export type BatchSettlementOutcome =
  | { kind: "submitted"; creditcoinTxHash: Hex; settlementCount: number }
  | { kind: "ready"; settlementCount: number }
  | {
      kind: "rejected";
      failures: Array<{ invoiceId: Hex; reason: SettlementSkipReason }>;
    };

export type BatchSettlementDependencies = {
  sourceChainKey: number;
  readInvoice: (invoiceId: Hex) => Promise<InvoiceSnapshot>;
  buildProof: (
    requests: PendingProofRequest[],
    options?: { signal?: AbortSignal }
  ) => Promise<BatchProof>;
  submitBatch: (payload: {
    payments: InvoicePayment[];
    proof: BatchProof;
  }) => Promise<Hex>;
};

export async function processSettlementBatch(
  payments: InvoicePayment[],
  dependencies: BatchSettlementDependencies,
  options: { dryRun?: boolean; signal?: AbortSignal } = {}
): Promise<BatchSettlementOutcome> {
  if (payments.length < 2 || payments.length > 10) {
    throw new Error("A settlement batch must contain between 2 and 10 payments");
  }

  const invoiceIds = new Set<string>();
  const transactionHashes = new Set<string>();
  for (const payment of payments) {
    const normalizedInvoiceId = payment.invoiceId.toLowerCase();
    const normalizedTxHash = payment.transactionHash.toLowerCase();
    if (invoiceIds.has(normalizedInvoiceId)) {
      throw new Error(`Duplicate invoice in settlement batch: ${payment.invoiceId}`);
    }
    if (transactionHashes.has(normalizedTxHash)) {
      throw new Error(
        `Duplicate source transaction in settlement batch: ${payment.transactionHash}`
      );
    }
    invoiceIds.add(normalizedInvoiceId);
    transactionHashes.add(normalizedTxHash);
  }

  const invoices = await Promise.all(
    payments.map((payment) => dependencies.readInvoice(payment.invoiceId))
  );
  const failures = payments.flatMap((payment, index) => {
    const reason = validatePaymentAgainstInvoice(payment, invoices[index]);
    return reason ? [{ invoiceId: payment.invoiceId, reason }] : [];
  });
  if (failures.length > 0) return { kind: "rejected", failures };
  if (options.dryRun) return { kind: "ready", settlementCount: payments.length };

  const proof = await dependencies.buildProof(
    payments.map((payment) => ({
      txHash: payment.transactionHash,
      chainKey: dependencies.sourceChainKey,
      blockNumber: payment.blockNumber
    })),
    { signal: options.signal }
  );
  const creditcoinTxHash = await dependencies.submitBatch({ payments, proof });
  return {
    kind: "submitted",
    creditcoinTxHash,
    settlementCount: payments.length
  };
}
