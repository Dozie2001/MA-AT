import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Address, Hex } from "viem";

import type { BatchProof } from "./buildProof.js";
import type { InvoicePayment } from "./payment.js";
import {
  processSettlementBatch,
  type BatchSettlementDependencies
} from "./processSettlementBatch.js";

const payer = "0x0000000000000000000000000000000000000001" as Address;
const vendor = "0x0000000000000000000000000000000000000002" as Address;
const secondVendor = "0x0000000000000000000000000000000000000003" as Address;
const creditcoinTxHash = `0x${"99".repeat(32)}` as Hex;

function payment(index: number, paymentVendor: Address): InvoicePayment {
  return {
    transactionHash: `0x${index.toString(16).padStart(2, "0").repeat(32)}` as Hex,
    blockNumber: 100n + BigInt(index),
    invoiceId: `0x${(index + 16).toString(16).padStart(2, "0").repeat(32)}` as Hex,
    payer,
    vendor: paymentVendor,
    amount: BigInt(index) * 1_000_000n,
    paidAt: 1_800_000_000n + BigInt(index)
  };
}

const payments = [payment(1, vendor), payment(2, secondVendor)];
const proof: BatchProof = {
  cached: true,
  chainKey: 1,
  continuityProof: {
    lowerEndpointDigest: `0x${"44".repeat(32)}`,
    roots: []
  },
  entries: payments.map((entry, index) => ({
    headerNumber: Number(entry.blockNumber),
    txIndex: index,
    txHash: entry.transactionHash,
    txBytes: "0x01",
    merkleProof: { root: `0x${"55".repeat(32)}`, siblings: [] }
  })),
  fromHeader: 101,
  generatedAt: "2026-08-21T00:00:00.000Z",
  toHeader: 102
};

function dependencies(options: {
  statusByInvoice?: Map<string, number>;
  calls: { proof: number; submit: number };
}): BatchSettlementDependencies {
  return {
    sourceChainKey: 1,
    readInvoice: async (invoiceId) => {
      const current = payments.find((entry) => entry.invoiceId === invoiceId)!;
      return {
        vendor: current.vendor,
        buyer: current.payer,
        amount: current.amount,
        status: options.statusByInvoice?.get(invoiceId) ?? 1
      };
    },
    buildProof: async (requests) => {
      options.calls.proof += 1;
      assert.deepEqual(
        requests.map((request) => request.txHash),
        payments.map((entry) => entry.transactionHash)
      );
      return proof;
    },
    submitBatch: async () => {
      options.calls.submit += 1;
      return creditcoinTxHash;
    }
  };
}

describe("processSettlementBatch", () => {
  it("validates every invoice before building and submitting one batch proof", async () => {
    const calls = { proof: 0, submit: 0 };
    const result = await processSettlementBatch(payments, dependencies({ calls }));

    assert.deepEqual(result, {
      kind: "submitted",
      creditcoinTxHash,
      settlementCount: 2
    });
    assert.deepEqual(calls, { proof: 1, submit: 1 });
  });

  it("rejects the complete batch before proof generation when one invoice is closed", async () => {
    const calls = { proof: 0, submit: 0 };
    const result = await processSettlementBatch(
      payments,
      dependencies({
        calls,
        statusByInvoice: new Map([[payments[1].invoiceId, 3]])
      })
    );

    assert.deepEqual(result, {
      kind: "rejected",
      failures: [
        { invoiceId: payments[1].invoiceId, reason: "invoice-cancelled" }
      ]
    });
    assert.deepEqual(calls, { proof: 0, submit: 0 });
  });

  it("rejects duplicate invoices and duplicate source transactions", async () => {
    const calls = { proof: 0, submit: 0 };
    await assert.rejects(
      processSettlementBatch(
        [payments[0], { ...payments[1], invoiceId: payments[0].invoiceId }],
        dependencies({ calls })
      ),
      /Duplicate invoice/
    );
    await assert.rejects(
      processSettlementBatch(
        [
          payments[0],
          { ...payments[1], transactionHash: payments[0].transactionHash }
        ],
        dependencies({ calls })
      ),
      /Duplicate source transaction/
    );
  });
});
