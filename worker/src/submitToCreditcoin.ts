import { privateKeyToAccount } from "viem/accounts";
import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
  parseAbi,
} from "viem";

import { config } from "./config.js";
import type { ProofByTxResponse } from "./buildProof.js";

export type VerifiedExecutionPayload = {
  agent: string;
  executionId: string;
  success: boolean;
  volume: bigint;
  observedAt: bigint;
  proof: ProofByTxResponse;
};

const maatVerifierAbi = parseAbi([
  "function submitVerifiedExecution(uint64 chainKey, uint64 height, bytes encodedTransaction, (bytes32 root, (bytes32 hash, bool isLeft)[] siblings) merkleProof, (bytes32 lowerEndpointDigest, bytes32[] roots) continuityProof) returns (bool)"
]);

function normalizePrivateKey(value: string): `0x${string}` {
  const normalized = value.startsWith("0x") ? value : `0x${value}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(normalized)) {
    throw new Error("CREDITCOIN_PRIVATE_KEY must be a 32-byte hex private key");
  }

  return normalized as `0x${string}`;
}

export async function submitToCreditcoin(payload: VerifiedExecutionPayload): Promise<void> {
  if (!config.maatVerifierAddress) {
    throw new Error("Missing MAAT_VERIFIER_ADDRESS in environment");
  }

  const privateKey = process.env.CREDITCOIN_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("Missing CREDITCOIN_PRIVATE_KEY in environment");
  }

  const account = privateKeyToAccount(normalizePrivateKey(privateKey));
  const chain = {
    id: config.creditcoinChainId,
    name: "creditcoinTestnet",
    nativeCurrency: {
      decimals: 18,
      name: "Creditcoin Testnet",
      symbol: "tCTC"
    },
    rpcUrls: {
      default: {
        http: [config.creditcoinRpcUrl]
      }
    }
  } as const;

  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(config.creditcoinRpcUrl)
  });

  const publicClient = createPublicClient({
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
      address: getAddress(config.maatVerifierAddress),
      abi: maatVerifierAbi,
      functionName: "submitVerifiedExecution",
      args
    }));
  } catch (error) {
    if (error instanceof BaseError) {
      const reverted = error.walk(
        (cause) => cause instanceof ContractFunctionRevertedError
      );
      if (reverted instanceof ContractFunctionRevertedError) {
        throw new Error(
          `Creditcoin simulation reverted: ${reverted.reason ?? reverted.shortMessage}`
        );
      }
    }
    throw error;
  }

  const txHash = await walletClient.writeContract(request);

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

  console.log(
    JSON.stringify(
      {
        creditcoinTxHash: txHash,
        status: receipt.status,
        agent: payload.agent,
        executionId: payload.executionId,
        proofTxHash: payload.proof.txHash,
        proofHeaderNumber: payload.proof.headerNumber,
        proofTxIndex: payload.proof.txIndex
      },
      null,
      2
    )
  );
}
