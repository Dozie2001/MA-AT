import { decodeEventLog, getAddress, parseAbiItem } from "viem";
import type { Address, Hex } from "viem";

export const paymentEvent = parseAbiItem(
  "event InvoicePaid(bytes32 indexed invoiceId, address indexed payer, address indexed vendor, uint256 amount, uint256 paidAt)"
);

export type InvoicePayment = {
  transactionHash: Hex;
  blockNumber: bigint;
  invoiceId: Hex;
  payer: Address;
  vendor: Address;
  amount: bigint;
  paidAt: bigint;
};

type DecodablePaymentLog = {
  data: Hex;
  topics: readonly Hex[];
  transactionHash: Hex | null;
  blockNumber: bigint | null;
};

export function decodePaymentLog(log: DecodablePaymentLog): InvoicePayment {
  if (!log.transactionHash || log.blockNumber === null) {
    throw new Error("InvoicePaid log is missing transaction or block identity");
  }

  const decoded = decodeEventLog({
    abi: [paymentEvent],
    eventName: "InvoicePaid",
    data: log.data,
    topics: log.topics as [] | [Hex, ...Hex[]]
  });

  return {
    transactionHash: log.transactionHash,
    blockNumber: log.blockNumber,
    invoiceId: decoded.args.invoiceId,
    payer: getAddress(decoded.args.payer),
    vendor: getAddress(decoded.args.vendor),
    amount: decoded.args.amount,
    paidAt: decoded.args.paidAt
  };
}
