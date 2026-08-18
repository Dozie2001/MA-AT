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

import type { ProofByTxResponse } from "./buildProof.js";
import { config } from "./config.js";

export type VerifiedSettlementPreview = {
  invoiceId: `0x${string}`;
  payer: `0x${string}`;
  vendor: `0x${string}`;
  amount: bigint;
  paidAt: bigint;
  proof: ProofByTxResponse;
};

const settlementVerifierAbi = parseAbi([
  "function submitVerifiedSettlement(uint64 chainKey, uint64 height, bytes encodedTransaction, (bytes32 root, (bytes32 hash, bool isLeft)[] siblings) merkleProof, (bytes32 lowerEndpointDigest, bytes32[] roots) continuityProof) returns (bool)",
  "error UnexpectedSourceChain()",
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

export async function submitSettlementToCreditcoin(
  payload: VerifiedSettlementPreview
): Promise<`0x${string}`> {
  if (!config.settlementVerifierAddress) {
    throw new Error("Missing MAAT_SETTLEMENT_VERIFIER_ADDRESS in environment");
  }
  if (!payload.proof.txBytes || !payload.proof.txHash) {
    throw new Error("Proof API response is missing transaction bytes or transaction hash");
  }

  const privateKey = process.env.CREDITCOIN_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("Missing CREDITCOIN_PRIVATE_KEY in environment");
  }

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
    BigInt(payload.proof.headerNumber),
    payload.proof.txBytes as `0x${string}`,
    {
      root: payload.proof.merkleProof.root as `0x${string}`,
      siblings: payload.proof.merkleProof.siblings.map((sibling) => ({
        hash: sibling.hash as `0x${string}`,
        isLeft: sibling.isLeft
      }))
    },
    {
      lowerEndpointDigest: payload.proof.continuityProof.lowerEndpointDigest as `0x${string}`,
      roots: payload.proof.continuityProof.roots as `0x${string}`[]
    }
  ] as const;

  let request;
  try {
    ({ request } = await publicClient.simulateContract({
      account,
      address: getAddress(config.settlementVerifierAddress),
      abi: settlementVerifierAbi,
      functionName: "submitVerifiedSettlement",
      args
    }));
  } catch (error) {
    if (error instanceof BaseError) {
      const reverted = error.walk(
        (cause) => cause instanceof ContractFunctionRevertedError
      );
      if (reverted instanceof ContractFunctionRevertedError) {
        const errorName = reverted.data?.errorName;
        const decodedReason =
          errorName ??
          (reverted.reason?.startsWith("VM Exception") ? undefined : reverted.reason);
        if (decodedReason) {
          throw new Error(`Creditcoin simulation reverted: ${decodedReason}`);
        }
      }
    }
    throw error;
  }

  const creditcoinTxHash = await walletClient.writeContract(request);
  const receipt = await publicClient.waitForTransactionReceipt({ hash: creditcoinTxHash });
  if (receipt.status !== "success") {
    throw new Error(`Creditcoin settlement transaction ${creditcoinTxHash} reverted`);
  }

  console.log(
    JSON.stringify(
      {
        creditcoinTxHash,
        status: receipt.status,
        invoiceId: payload.invoiceId,
        payer: payload.payer,
        vendor: payload.vendor,
        amount: payload.amount.toString(),
        paidAt: payload.paidAt.toString(),
        proofTxHash: payload.proof.txHash,
        proofHeaderNumber: payload.proof.headerNumber,
        proofTxIndex: payload.proof.txIndex
      },
      null,
      2
    )
  );

  return creditcoinTxHash;
}
