import { getAddress } from "viem";
import type { Address, Hex } from "viem";

import type { PendingProofRequest, ProofByTxResponse } from "./buildProof.js";
import type { InvoicePayment } from "./payment.js";

export type InvoiceSnapshot = {
  vendor: Address;
  buyer: Address;
  amount: bigint;
  status: number;
};

export type SettlementSkipReason =
  | "invoice-not-found"
  | "invoice-settled"
  | "invoice-cancelled"
  | "invoice-not-open"
  | "payer-mismatch"
  | "vendor-mismatch"
  | "amount-mismatch";

export type SettlementOutcome =
  | { kind: "submitted"; creditcoinTxHash: Hex }
  | { kind: "ready" }
  | { kind: "skipped"; reason: SettlementSkipReason };

export type SettlementStage =
  | "invoice-validated"
  | "waiting-for-attestation"
  | "proof-generated"
  | "settlement-confirmed";

export type SettlementDependencies = {
  sourceChainKey: number;
  readInvoice: (invoiceId: Hex) => Promise<InvoiceSnapshot>;
  buildProof: (
    request: PendingProofRequest,
    signal?: AbortSignal
  ) => Promise<ProofByTxResponse>;
  submitSettlement: (payload: {
    invoiceId: Hex;
    payer: Address;
    vendor: Address;
    amount: bigint;
    paidAt: bigint;
    proof: ProofByTxResponse;
  }) => Promise<Hex>;
  onStage?: (stage: SettlementStage, payment: InvoicePayment) => void;
};

export function validatePaymentAgainstInvoice(
  payment: InvoicePayment,
  invoice: InvoiceSnapshot
): SettlementSkipReason | null {
  if (invoice.status === 0) return "invoice-not-found";
  if (invoice.status === 2) return "invoice-settled";
  if (invoice.status === 3) return "invoice-cancelled";
  if (invoice.status !== 1) return "invoice-not-open";
  if (getAddress(invoice.buyer) !== payment.payer) return "payer-mismatch";
  if (getAddress(invoice.vendor) !== payment.vendor) return "vendor-mismatch";
  if (invoice.amount !== payment.amount) return "amount-mismatch";
  return null;
}

export async function processSettlement(
  payment: InvoicePayment,
  dependencies: SettlementDependencies,
  options: { dryRun?: boolean; signal?: AbortSignal } = {}
): Promise<SettlementOutcome> {
  const invoice = await dependencies.readInvoice(payment.invoiceId);
  const rejection = validatePaymentAgainstInvoice(payment, invoice);
  if (rejection) return { kind: "skipped", reason: rejection };

  dependencies.onStage?.("invoice-validated", payment);
  if (options.dryRun) return { kind: "ready" };

  dependencies.onStage?.("waiting-for-attestation", payment);
  const proof = await dependencies.buildProof(
    {
      txHash: payment.transactionHash,
      chainKey: dependencies.sourceChainKey,
      blockNumber: payment.blockNumber
    },
    options.signal
  );
  dependencies.onStage?.("proof-generated", payment);

  const creditcoinTxHash = await dependencies.submitSettlement({
    invoiceId: payment.invoiceId,
    payer: payment.payer,
    vendor: payment.vendor,
    amount: payment.amount,
    paidAt: payment.paidAt,
    proof
  });
  dependencies.onStage?.("settlement-confirmed", payment);

  return { kind: "submitted", creditcoinTxHash };
}
