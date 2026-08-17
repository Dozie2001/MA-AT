import { config } from "./config.js";

export type PendingProofRequest = {
  txHash: string;
  chainKey: number;
  blockNumber: bigint;
};

type MerkleProofEntry = {
  hash: string;
  isLeft: boolean;
};

type TransactionMerkleProof = {
  root: string;
  siblings: MerkleProofEntry[];
};

type ContinuityProof = {
  lowerEndpointDigest: string;
  roots: string[];
};

export type ProofByTxResponse = {
  cached: boolean;
  chainKey: number;
  continuityProof: ContinuityProof;
  generatedAt: string;
  headerNumber: number;
  merkleProof: TransactionMerkleProof;
  txBytes: string | null;
  txHash: string | null;
  txIndex: number;
};

type AttestedHeightResponse = {
  attestedHeight: number | null;
};

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      accept: "application/json"
    }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Proof API request failed (${response.status}): ${body}`);
  }

  return (await response.json()) as T;
}

export async function getAttestedHeight(chainKey: number): Promise<number | null> {
  const url = `${config.proofApiUrl}/api/v1/attested-height/${chainKey}`;
  const payload = await getJson<AttestedHeightResponse>(url);
  return payload.attestedHeight;
}

export async function waitUntilHeightAttested(
  chainKey: number,
  blockNumber: bigint,
  pollIntervalMs = 15_000
): Promise<number> {
  for (;;) {
    const attestedHeight = await getAttestedHeight(chainKey);
    if (attestedHeight !== null && BigInt(attestedHeight) >= blockNumber) {
      return attestedHeight;
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
}

export async function getProofByTx(
  chainKey: number,
  txHash: string
): Promise<ProofByTxResponse> {
  const url = `${config.proofApiUrl}/api/v1/proof-by-tx/${chainKey}/${txHash}`;
  return getJson<ProofByTxResponse>(url);
}

export async function buildProof(request: PendingProofRequest): Promise<ProofByTxResponse> {
  await waitUntilHeightAttested(request.chainKey, request.blockNumber);
  return getProofByTx(request.chainKey, request.txHash);
}
