import { createServerFn } from '@tanstack/react-start'
import { isHash } from 'viem'

const proofApiUrl =
  'https://proof-gen-api.cc3-testnet.creditcoin.network/api/v1/proof-by-tx'
const sepoliaChainKey = 1

type ProofResponse = {
  cached: boolean
  chainKey: number
  continuityProof?: {
    lowerEndpointDigest: string
    roots: string[]
  }
  generatedAt: string
  headerNumber: number
  merkleProof?: {
    root: string
    siblings: Array<{ hash: string; isLeft: boolean }>
  }
  txHash: string | null
  txIndex: number
}

function transactionHashValidator(input: { transactionHash: string }) {
  if (!isHash(input.transactionHash)) {
    throw new Error('A valid transaction hash is required')
  }
  return { transactionHash: input.transactionHash }
}

export const getAttestcoinProofReceipt = createServerFn({ method: 'GET' })
  .validator(transactionHashValidator)
  .handler(async ({ data }) => {
    const response = await fetch(
      `${proofApiUrl}/${sepoliaChainKey}/${data.transactionHash}`,
      {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(15_000),
      },
    )

    if (response.status === 404) return { available: false as const }
    if (!response.ok) {
      throw new Error(`Attestcoin proof API returned HTTP ${response.status}`)
    }

    const proof = (await response.json()) as ProofResponse
    if (
      proof.chainKey !== sepoliaChainKey ||
      proof.txHash?.toLowerCase() !== data.transactionHash.toLowerCase() ||
      !Number.isSafeInteger(proof.headerNumber) ||
      !Number.isSafeInteger(proof.txIndex) ||
      !proof.merkleProof?.root ||
      !Array.isArray(proof.merkleProof.siblings) ||
      !Array.isArray(proof.continuityProof?.roots)
    ) {
      throw new Error('Attestcoin proof API returned an invalid proof receipt')
    }

    return {
      available: true as const,
      cached: proof.cached,
      chainKey: proof.chainKey,
      generatedAt: proof.generatedAt,
      headerNumber: proof.headerNumber,
      txHash: proof.txHash,
      txIndex: proof.txIndex,
      merkleRoot: proof.merkleProof.root,
      merkleSiblingCount: proof.merkleProof.siblings.length,
      continuityRootCount: proof.continuityProof.roots.length,
      lowerEndpointDigest: proof.continuityProof.lowerEndpointDigest,
    }
  })
