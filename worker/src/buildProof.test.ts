import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildBatchProof } from "./buildProof.js";

const firstHash = `0x${"11".repeat(32)}`;
const secondHash = `0x${"22".repeat(32)}`;
const digest = `0x${"33".repeat(32)}`;
const root = `0x${"44".repeat(32)}`;

function requests() {
  return [
    { txHash: firstHash, chainKey: 1, blockNumber: 100n },
    { txHash: secondHash, chainKey: 1, blockNumber: 101n }
  ];
}

function jsonResponse(value: unknown) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

describe("buildBatchProof", () => {
  it("posts transaction hashes and preserves request order in the normalized proof", async () => {
    const originalFetch = globalThis.fetch;
    let postedBody: string | undefined;
    globalThis.fetch = (async (input, init) => {
      const url = input.toString();
      if (url.includes("/attested-height/")) {
        return jsonResponse({ attestedHeight: 101 });
      }

      postedBody = init?.body?.toString();
      return jsonResponse({
        cached: false,
        chainKey: 1,
        continuityProof: { lowerEndpointDigest: digest, roots: [root] },
        fromHeader: 100,
        generatedAt: "2026-08-21T00:00:00.000Z",
        merkleProofs: {
          "101": {
            "7": {
              txHash: secondHash,
              txBytes: "0x02",
              merkleProof: { root, siblings: [] }
            }
          },
          "100": {
            "3": {
              txHash: firstHash,
              txBytes: "0x01",
              merkleProof: { root, siblings: [] }
            }
          }
        },
        toHeader: 101
      });
    }) as typeof fetch;

    try {
      const proof = await buildBatchProof(requests());
      assert.equal(postedBody, JSON.stringify([firstHash, secondHash]));
      assert.deepEqual(
        proof.entries.map((entry) => [entry.txHash, entry.headerNumber, entry.txIndex]),
        [
          [firstHash, 100, 3],
          [secondHash, 101, 7]
        ]
      );
      assert.deepEqual(proof.continuityProof, {
        lowerEndpointDigest: digest,
        roots: [root]
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("rejects duplicate transactions before calling the proof service", async () => {
    await assert.rejects(
      buildBatchProof([
        requests()[0],
        { ...requests()[1], txHash: firstHash }
      ]),
      /Duplicate transaction hash/
    );
  });

  it("rejects an incomplete proof API response", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input) => {
      const url = input.toString();
      if (url.includes("/attested-height/")) {
        return jsonResponse({ attestedHeight: 101 });
      }
      return jsonResponse({
        cached: true,
        chainKey: 1,
        continuityProof: { lowerEndpointDigest: digest, roots: [root] },
        fromHeader: 100,
        generatedAt: "2026-08-21T00:00:00.000Z",
        merkleProofs: {
          "100": {
            "3": {
              txHash: firstHash,
              txBytes: "0x01",
              merkleProof: { root, siblings: [] }
            }
          }
        },
        toHeader: 101
      });
    }) as typeof fetch;

    try {
      await assert.rejects(buildBatchProof(requests()), /omitted transaction/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
