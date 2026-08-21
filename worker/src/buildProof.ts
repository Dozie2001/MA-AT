import { config } from "./config.js";

export type PendingProofRequest = {
  txHash: string;
  chainKey: number;
  blockNumber: bigint;
};

export type MerkleProofEntry = {
  hash: string;
  isLeft: boolean;
};

export type TransactionMerkleProof = {
  root: string;
  siblings: MerkleProofEntry[];
};

export type ContinuityProof = {
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

type BatchMerkleProofEntry = {
  merkleProof: TransactionMerkleProof;
  txBytes: string | null;
  txHash: string | null;
};

type BatchProofByTxResponse = {
  cached: boolean;
  chainKey: number;
  continuityProof: ContinuityProof;
  fromHeader: number;
  generatedAt: string;
  merkleProofs: Record<string, Record<string, BatchMerkleProofEntry>>;
  toHeader: number;
};

export type BatchProofEntry = {
  headerNumber: number;
  txIndex: number;
  txHash: string;
  txBytes: string;
  merkleProof: TransactionMerkleProof;
};

export type BatchProof = {
  cached: boolean;
  chainKey: number;
  continuityProof: ContinuityProof;
  fromHeader: number;
  generatedAt: string;
  entries: BatchProofEntry[];
  toHeader: number;
};

async function getJson<T>(
  url: string,
  signal?: AbortSignal,
  init: RequestInit = {}
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    signal,
    headers: {
      accept: "application/json",
      ...init.headers
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

export async function getBatchProofByTx(
  chainKey: number,
  txHashes: string[],
  signal?: AbortSignal
): Promise<BatchProofByTxResponse> {
  const url = `${config.proofApiUrl}/api/v1/proof-batch-by-tx/${chainKey}`;
  return getJson<BatchProofByTxResponse>(url, signal, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(txHashes)
  });
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

export async function buildBatchProof(
  requests: PendingProofRequest[],
  options: { signal?: AbortSignal } = {}
): Promise<BatchProof> {
  if (requests.length < 2 || requests.length > 10) {
    throw new Error("A settlement batch must contain between 2 and 10 transactions");
  }

  const chainKey = requests[0].chainKey;
  const requestedHashes = new Map<string, PendingProofRequest>();
  let highestBlock = requests[0].blockNumber;
  for (const request of requests) {
    if (request.chainKey !== chainKey) {
      throw new Error("All batch transactions must use the same source chain key");
    }
    const normalizedHash = request.txHash.toLowerCase();
    if (!/^0x[0-9a-f]{64}$/.test(normalizedHash)) {
      throw new Error(`Invalid transaction hash: ${request.txHash}`);
    }
    if (requestedHashes.has(normalizedHash)) {
      throw new Error(`Duplicate transaction hash: ${request.txHash}`);
    }
    requestedHashes.set(normalizedHash, request);
    if (request.blockNumber > highestBlock) highestBlock = request.blockNumber;
  }

  await waitUntilHeightAttested(chainKey, highestBlock, 15_000, options.signal);
  const response = await getBatchProofByTx(
    chainKey,
    requests.map((request) => request.txHash),
    options.signal
  );
  if (response.chainKey !== chainKey) {
    throw new Error(
      `Proof API returned chain key ${response.chainKey}, expected ${chainKey}`
    );
  }

  const entriesByHash = new Map<string, BatchProofEntry>();
  for (const [header, proofsByIndex] of Object.entries(response.merkleProofs)) {
    const headerNumber = Number(header);
    if (!Number.isSafeInteger(headerNumber) || headerNumber < 0) {
      throw new Error(`Proof API returned invalid header number: ${header}`);
    }

    for (const [index, entry] of Object.entries(proofsByIndex)) {
      const txIndex = Number(index);
      if (!Number.isSafeInteger(txIndex) || txIndex < 0) {
        throw new Error(`Proof API returned invalid transaction index: ${index}`);
      }
      if (!entry.txHash || !entry.txBytes) {
        throw new Error("Batch proof entry is missing transaction bytes or hash");
      }
      const normalizedHash = entry.txHash.toLowerCase();
      const requested = requestedHashes.get(normalizedHash);
      if (!requested) {
        throw new Error(`Proof API returned an unexpected transaction: ${entry.txHash}`);
      }
      if (entriesByHash.has(normalizedHash)) {
        throw new Error(`Proof API returned duplicate transaction: ${entry.txHash}`);
      }
      if (BigInt(headerNumber) !== requested.blockNumber) {
        throw new Error(
          `Proof API returned block ${headerNumber} for ${entry.txHash}, expected ${requested.blockNumber}`
        );
      }
      entriesByHash.set(normalizedHash, {
        headerNumber,
        txIndex,
        txHash: entry.txHash,
        txBytes: entry.txBytes,
        merkleProof: entry.merkleProof
      });
    }
  }

  const entries = requests.map((request) => {
    const entry = entriesByHash.get(request.txHash.toLowerCase());
    if (!entry) {
      throw new Error(`Proof API omitted transaction: ${request.txHash}`);
    }
    return entry;
  });

  return {
    cached: response.cached,
    chainKey: response.chainKey,
    continuityProof: response.continuityProof,
    fromHeader: response.fromHeader,
    generatedAt: response.generatedAt,
    entries,
    toHeader: response.toHeader
  };
}
