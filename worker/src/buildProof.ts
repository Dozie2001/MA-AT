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

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    signal,
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

export async function getAttestedHeight(
  chainKey: number,
  signal?: AbortSignal
): Promise<number | null> {
  const url = `${config.proofApiUrl}/api/v1/attested-height/${chainKey}`;
  const payload = await getJson<AttestedHeightResponse>(url, signal);
  return payload.attestedHeight;
}

async function wait(pollIntervalMs: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw signal.reason;

  await new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timeout);
      reject(signal?.reason ?? new Error("Proof wait aborted"));
    };
    const timeout = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, pollIntervalMs);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export async function waitUntilHeightAttested(
  chainKey: number,
  blockNumber: bigint,
  pollIntervalMs = 15_000,
  signal?: AbortSignal
): Promise<number> {
  for (;;) {
    const attestedHeight = await getAttestedHeight(chainKey, signal);
    if (attestedHeight !== null && BigInt(attestedHeight) >= blockNumber) {
      return attestedHeight;
    }

    await wait(pollIntervalMs, signal);
  }
}

export async function getProofByTx(
  chainKey: number,
  txHash: string,
  signal?: AbortSignal
): Promise<ProofByTxResponse> {
  const url = `${config.proofApiUrl}/api/v1/proof-by-tx/${chainKey}/${txHash}`;
  return getJson<ProofByTxResponse>(url, signal);
}

export async function buildProof(
  request: PendingProofRequest,
  options: { signal?: AbortSignal } = {}
): Promise<ProofByTxResponse> {
  await waitUntilHeightAttested(
    request.chainKey,
    request.blockNumber,
    15_000,
    options.signal
  );
  return getProofByTx(request.chainKey, request.txHash, options.signal);
}
