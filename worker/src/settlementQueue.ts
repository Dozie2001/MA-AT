import type { Hex } from "viem";

import type { InvoicePayment } from "./payment.js";
import type { SettlementOutcome } from "./processSettlement.js";

type QueueOptions = {
  retryDelayMs: number;
  signal: AbortSignal;
  process: (payment: InvoicePayment) => Promise<SettlementOutcome>;
  onRetry: (payment: InvoicePayment, error: unknown) => void;
};

function abortError() {
  const error = new Error("Settlement worker stopped");
  error.name = "AbortError";
  return error;
}

async function waitForRetry(delayMs: number, signal: AbortSignal) {
  if (signal.aborted) throw abortError();

  await new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timeout);
      reject(abortError());
    };
    const timeout = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export class SettlementQueue {
  private readonly completedTransactions = new Map<Hex, SettlementOutcome>();
  private readonly transactionTasks = new Map<Hex, Promise<SettlementOutcome>>();
  private readonly invoiceTails = new Map<Hex, Promise<SettlementOutcome>>();

  constructor(private readonly options: QueueOptions) {}

  enqueue(payment: InvoicePayment): Promise<SettlementOutcome> {
    const existing = this.transactionTasks.get(payment.transactionHash);
    if (existing) return existing;

    const completed = this.completedTransactions.get(payment.transactionHash);
    if (completed) return Promise.resolve(completed);

    const previous = this.invoiceTails.get(payment.invoiceId);
    const task = (previous ? previous.catch(() => undefined) : Promise.resolve()).then(
      () => this.processWithRetry(payment)
    );

    this.transactionTasks.set(payment.transactionHash, task);
    this.invoiceTails.set(payment.invoiceId, task);

    const cleanup = () => {
      this.transactionTasks.delete(payment.transactionHash);
      if (this.invoiceTails.get(payment.invoiceId) === task) {
        this.invoiceTails.delete(payment.invoiceId);
      }
    };
    void task.then(cleanup, cleanup);

    return task;
  }

  async drain(): Promise<void> {
    await Promise.allSettled(this.transactionTasks.values());
  }

  private async processWithRetry(
    payment: InvoicePayment
  ): Promise<SettlementOutcome> {
    for (;;) {
      if (this.options.signal.aborted) throw abortError();

      try {
        const outcome = await this.options.process(payment);
        this.completedTransactions.set(payment.transactionHash, outcome);
        return outcome;
      } catch (error) {
        if (this.options.signal.aborted) throw abortError();
        this.options.onRetry(payment, error);
        await waitForRetry(this.options.retryDelayMs, this.options.signal);
      }
    }
  }
}
