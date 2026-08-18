import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Address, Hex } from "viem";

import type { ProofByTxResponse } from "./buildProof.js";
import type { InvoicePayment } from "./payment.js";
import {
  processSettlement,
  type InvoiceSnapshot,
  type SettlementDependencies
} from "./processSettlement.js";

const payer = "0x0000000000000000000000000000000000000001" as Address;
const vendor = "0x0000000000000000000000000000000000000002" as Address;
const invoiceId = `0x${"11".repeat(32)}` as Hex;
const transactionHash = `0x${"22".repeat(32)}` as Hex;
const creditcoinTxHash = `0x${"33".repeat(32)}` as Hex;

const payment: InvoicePayment = {
  transactionHash,
  blockNumber: 12_345n,
  invoiceId,
  payer,
  vendor,
  amount: 1_000_000n,
  paidAt: 1_800_000_000n
};

const proof: ProofByTxResponse = {
  cached: true,
  chainKey: 1,
  continuityProof: { lowerEndpointDigest: `0x${"44".repeat(32)}`, roots: [] },
  generatedAt: "2026-08-18T00:00:00.000Z",
  headerNumber: 12_345,
  merkleProof: { root: `0x${"55".repeat(32)}`, siblings: [] },
  txBytes: "0x01",
  txHash: transactionHash,
  txIndex: 0
};

function invoice(overrides: Partial<InvoiceSnapshot> = {}): InvoiceSnapshot {
  return {
    vendor,
    buyer: payer,
    amount: payment.amount,
    status: 1,
    ...overrides
  };
}

function dependencies(
  snapshot: InvoiceSnapshot,
  calls: { proof: number; submit: number; chainKey?: number }
): SettlementDependencies {
  return {
    sourceChainKey: 1,
    readInvoice: async () => snapshot,
    buildProof: async (request) => {
      calls.proof += 1;
      calls.chainKey = request.chainKey;
      return proof;
    },
    submitSettlement: async () => {
      calls.submit += 1;
      return creditcoinTxHash;
    }
  };
}

describe("processSettlement", () => {
  it("submits an exact open invoice with the configured source chain key", async () => {
    const calls = { proof: 0, submit: 0 };
    const result = await processSettlement(payment, dependencies(invoice(), calls));

    assert.deepEqual(result, { kind: "submitted", creditcoinTxHash });
    assert.deepEqual(calls, { proof: 1, submit: 1, chainKey: 1 });
  });

  it("does not request a proof for terminal invoice states", async () => {
    const cases = [
      [0, "invoice-not-found"],
      [2, "invoice-settled"],
      [3, "invoice-cancelled"],
      [4, "invoice-not-open"]
    ] as const;

    for (const [status, reason] of cases) {
      const calls = { proof: 0, submit: 0 };
      const result = await processSettlement(
        payment,
        dependencies(invoice({ status }), calls)
      );
      assert.deepEqual(result, { kind: "skipped", reason });
      assert.deepEqual(calls, { proof: 0, submit: 0 });
    }
  });

  it("rejects payer, vendor, and amount mismatches before proof generation", async () => {
    const cases: Array<[Partial<InvoiceSnapshot>, string]> = [
      [
        { buyer: "0x0000000000000000000000000000000000000003" },
        "payer-mismatch"
      ],
      [
        { vendor: "0x0000000000000000000000000000000000000003" },
        "vendor-mismatch"
      ],
      [{ amount: payment.amount + 1n }, "amount-mismatch"]
    ];

    for (const [overrides, reason] of cases) {
      const calls = { proof: 0, submit: 0 };
      const result = await processSettlement(
        payment,
        dependencies(invoice(overrides), calls)
      );
      assert.deepEqual(result, { kind: "skipped", reason });
      assert.deepEqual(calls, { proof: 0, submit: 0 });
    }
  });

  it("supports a read-only dry run", async () => {
    const calls = { proof: 0, submit: 0 };
    const result = await processSettlement(payment, dependencies(invoice(), calls), {
      dryRun: true
    });

    assert.deepEqual(result, { kind: "ready" });
    assert.deepEqual(calls, { proof: 0, submit: 0 });
  });
});
