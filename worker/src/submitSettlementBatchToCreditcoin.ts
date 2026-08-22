import { privateKeyToAccount } from "viem/accounts";
import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
  parseAbi
} from "viem";

import type { BatchProof } from "./buildProof.js";
import { config } from "./config.js";
import type { InvoicePayment } from "./payment.js";

const settlementVerifierAbi = parseAbi([
  "function submitVerifiedSettlementBatch(uint64 chainKey, uint64[] heights, bytes[] encodedTransactions, (bytes32 root, (bytes32 hash, bool isLeft)[] siblings)[] merkleProofs, (bytes32 lowerEndpointDigest, bytes32[] roots) sharedContinuityProof) returns (bool)",
  "error UnexpectedSourceChain()",
  "error InvalidBatchSize()",
  "error BatchLengthMismatch()",
  "error DuplicateBatchQuery()",
  "error QueryAlreadyProcessed()",
  "error ProofVerificationFailed()",
  "error InvoiceDoesNotExist()",
  "error InvoiceIsNotOpen()",
  "error PayerDoesNotMatchBuyer()",
  "error VendorDoesNotMatchInvoice()",
  "error AmountDoesNotMatchInvoice()",
  "error InvalidPaymentTimestamp()",
  "error InvoiceAlreadyProcessed()"
]);

function normalizePrivateKey(value: string): `0x${string}` {
  const normalized = value.startsWith("0x") ? value : `0x${value}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(normalized)) {
    throw new Error("CREDITCOIN_PRIVATE_KEY must be a 32-byte hex private key");
  }
  return normalized as `0x${string}`;
}

export async function submitSettlementBatchToCreditcoin(payload: {
  payments: InvoicePayment[];
  proof: BatchProof;
}): Promise<`0x${string}`> {
  if (!config.settlementVerifierAddress) {
    throw new Error("Missing MAAT_SETTLEMENT_VERIFIER_ADDRESS in environment");
  }
  if (payload.payments.length !== payload.proof.entries.length) {
    throw new Error("Batch payment and proof entry counts do not match");
  }
  for (let index = 0; index < payload.payments.length; index++) {
    if (
      payload.payments[index].transactionHash.toLowerCase() !==
      payload.proof.entries[index].txHash.toLowerCase()
    ) {
      throw new Error(`Batch proof order mismatch at index ${index}`);
    }
  }

  const privateKey = process.env.CREDITCOIN_PRIVATE_KEY;
  if (!privateKey) throw new Error("Missing CREDITCOIN_PRIVATE_KEY in environment");

  const account = privateKeyToAccount(normalizePrivateKey(privateKey));
  const chain = {
    id: config.creditcoinChainId,
    name: "creditcoinTestnet",
    nativeCurrency: { decimals: 18, name: "Creditcoin Testnet", symbol: "tCTC" },
    rpcUrls: { default: { http: [config.creditcoinRpcUrl] } }
  } as const;
  const publicClient = createPublicClient({
    chain,
    transport: http(config.creditcoinRpcUrl)
  });
  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(config.creditcoinRpcUrl)
  });

  const args = [
    BigInt(payload.proof.chainKey),
    payload.proof.entries.map((entry) => BigInt(entry.headerNumber)),
    payload.proof.entries.map((entry) => entry.txBytes as `0x${string}`),
    payload.proof.entries.map((entry) => ({
      root: entry.merkleProof.root as `0x${string}`,
      siblings: entry.merkleProof.siblings.map((sibling) => ({
        hash: sibling.hash as `0x${string}`,
        isLeft: sibling.isLeft
      }))
    })),
    {
      lowerEndpointDigest:
        payload.proof.continuityProof.lowerEndpointDigest as `0x${string}`,
      roots: payload.proof.continuityProof.roots as `0x${string}`[]
    }
  ] as const;

  let request;
  try {
    ({ request } = await publicClient.simulateContract({
      account,
      address: getAddress(config.settlementVerifierAddress),
      abi: settlementVerifierAbi,
      functionName: "submitVerifiedSettlementBatch",
      args
    }));
  } catch (error) {
    if (error instanceof BaseError) {
      const reverted = error.walk(
        (cause) => cause instanceof ContractFunctionRevertedError
      );
      if (reverted instanceof ContractFunctionRevertedError) {
        const decodedReason =
          reverted.data?.errorName ??
          (reverted.reason?.startsWith("VM Exception")
            ? undefined
            : reverted.reason);
        if (decodedReason) {
          throw new Error(`Creditcoin batch simulation reverted: ${decodedReason}`);
        }
      }
    }
    throw error;
  }

  const creditcoinTxHash = await walletClient.writeContract(request);
  const receipt = await publicClient.waitForTransactionReceipt({ hash: creditcoinTxHash });
  if (receipt.status !== "success") {
    throw new Error(`Creditcoin batch settlement ${creditcoinTxHash} reverted`);
  }

  console.log(
    JSON.stringify(
      {
        creditcoinTxHash,
        status: receipt.status,
        settlementCount: payload.payments.length,
        invoiceIds: payload.payments.map((payment) => payment.invoiceId),
        sourceTransactions: payload.proof.entries.map((entry) => ({
          txHash: entry.txHash,
          headerNumber: entry.headerNumber,
          txIndex: entry.txIndex
        })),
        sharedContinuityRange: {
          fromHeader: payload.proof.fromHeader,
          toHeader: payload.proof.toHeader
        }
      },
      null,
      2
    )
  );

  return creditcoinTxHash;
}
