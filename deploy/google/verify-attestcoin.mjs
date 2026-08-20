const proofApiUrl = "https://proof-gen-api.cc3-testnet.creditcoin.network";
const chainKey = 1;
const transactionHash =
  "0xb8d079f555b3caac2d74ade0fcefebbd384d57294ac9d318fc964ae1dde0f58e";
const expectedBlock = 11_508_787;

const hashPattern = /^0x[0-9a-fA-F]{64}$/;

async function getJson(path) {
  const response = await fetch(`${proofApiUrl}${path}`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`${path} returned HTTP ${response.status}`);
  }

  return response.json();
}

function requireValue(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const [heightResponse, proof] = await Promise.all([
  getJson(`/api/v1/attested-height/${chainKey}`),
  getJson(`/api/v1/proof-by-tx/${chainKey}/${transactionHash}`),
]);

requireValue(
  Number.isInteger(heightResponse.attestedHeight),
  "Attested height is not an integer",
);
requireValue(
  heightResponse.attestedHeight >= expectedBlock,
  `Attested height ${heightResponse.attestedHeight} is below payment block ${expectedBlock}`,
);
requireValue(proof.chainKey === chainKey, "Proof chain key does not match Sepolia");
requireValue(proof.headerNumber === expectedBlock, "Proof header does not match payment block");
requireValue(
  proof.txHash?.toLowerCase() === transactionHash.toLowerCase(),
  "Proof transaction hash does not match the requested payment",
);
requireValue(
  typeof proof.txBytes === "string" && proof.txBytes.startsWith("0x"),
  "Proof response is missing encoded transaction bytes",
);
requireValue(hashPattern.test(proof.merkleProof?.root), "Invalid Merkle root");
requireValue(Array.isArray(proof.merkleProof?.siblings), "Missing Merkle siblings");
requireValue(
  hashPattern.test(proof.continuityProof?.lowerEndpointDigest),
  "Invalid continuity-proof lower endpoint",
);
requireValue(Array.isArray(proof.continuityProof?.roots), "Missing continuity roots");

console.log("Attestcoin proof API readiness check passed");
console.log(`Attested Sepolia height: ${heightResponse.attestedHeight}`);
console.log(`Proof header: ${proof.headerNumber}`);
console.log(`Transaction: ${proof.txHash}`);
console.log(`Cached proof: ${Boolean(proof.cached)}`);
console.log(`Merkle siblings: ${proof.merkleProof.siblings.length}`);
console.log(`Continuity roots: ${proof.continuityProof.roots.length}`);
