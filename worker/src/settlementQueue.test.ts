import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Address, Hex } from "viem";

import type { InvoicePayment } from "./payment.js";
import type { SettlementOutcome } from "./processSettlement.js";
import { SettlementQueue } from "./settlementQueue.js";

const payer = "0x0000000000000000000000000000000000000001" as Address;
const vendor = "0x0000000000000000000000000000000000000002" as Address;

function payment(byte: string, invoiceByte = byte): InvoicePayment {
  return {
    transactionHash: `0x${byte.repeat(64)}` as Hex,
    blockNumber: 1n,
    invoiceId: `0x${invoiceByte.repeat(64)}` as Hex,
    payer,
    vendor,
    amount: 1n,
    paidAt: 1n
  };
}

const submitted: SettlementOutcome = {
  kind: "submitted",
  creditcoinTxHash: `0x${"f".repeat(64)}` as Hex
};

describe("SettlementQueue", () => {
  it("deduplicates the same transaction hash", async () => {
    const controller = new AbortController();
    let calls = 0;
    const queue = new SettlementQueue({
      retryDelayMs: 1,
      signal: controller.signal,
      process: async () => {
        calls += 1;
        return submitted;
      },
      onRetry: () => undefined
    });
    const currentPayment = payment("1");

    const first = queue.enqueue(currentPayment);
    const second = queue.enqueue(currentPayment);

    assert.strictEqual(first, second);
    assert.deepEqual(await first, submitted);
    assert.equal(calls, 1);
    assert.deepEqual(await queue.enqueue(currentPayment), submitted);
    assert.equal(calls, 1);
  });

  it("retries a transient failure", async () => {
    const controller = new AbortController();
    let attempts = 0;
    let retries = 0;
    const queue = new SettlementQueue({
      retryDelayMs: 1,
      signal: controller.signal,
      process: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error("temporary RPC failure");
        return submitted;
      },
      onRetry: () => {
        retries += 1;
      }
    });

    assert.deepEqual(await queue.enqueue(payment("2")), submitted);
    assert.equal(attempts, 2);
    assert.equal(retries, 1);
  });

  it("serializes one invoice without blocking a different invoice", async () => {
    const controller = new AbortController();
    const started: string[] = [];
    let releaseFirst: () => void = () => undefined;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const first = payment("3", "a");
    const second = payment("4", "a");
    const independent = payment("5", "b");
    const queue = new SettlementQueue({
      retryDelayMs: 1,
      signal: controller.signal,
      process: async (current) => {
        started.push(current.transactionHash);
        if (current.transactionHash === first.transactionHash) await firstGate;
        return submitted;
      },
      onRetry: () => undefined
    });

    const firstTask = queue.enqueue(first);
    const secondTask = queue.enqueue(second);
    const independentTask = queue.enqueue(independent);
    await new Promise((resolve) => setImmediate(resolve));

    assert.deepEqual(started, [first.transactionHash, independent.transactionHash]);
    releaseFirst();
    await Promise.all([firstTask, secondTask, independentTask]);
    assert.deepEqual(started, [
      first.transactionHash,
      independent.transactionHash,
      second.transactionHash
    ]);
  });
});
