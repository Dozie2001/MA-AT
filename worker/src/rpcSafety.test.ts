import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  exponentialBackoffMs,
  isRateLimitError,
  parseRpcUrls,
  safeErrorMessage,
} from "./rpcSafety.js";

describe("parseRpcUrls", () => {
  it("parses, trims, and deduplicates HTTPS endpoints", () => {
    assert.deepEqual(
      parseRpcUrls(
        "https://primary.example/key",
        [" https://fallback.example/key", "https://primary.example/key "],
      ),
      ["https://primary.example/key", "https://fallback.example/key"],
    );
  });

  it("rejects non-HTTPS endpoints", () => {
    assert.throws(
      () => parseRpcUrls("http://insecure.example"),
      /must use HTTPS/u,
    );
  });
});

describe("RPC retry safety", () => {
  it("recognizes common rate-limit errors", () => {
    assert.equal(isRateLimitError(new Error("HTTP status 429")), true);
    assert.equal(isRateLimitError(new Error("Too Many Requests")), true);
    assert.equal(isRateLimitError(new Error("rate limit exceeded")), true);
    assert.equal(isRateLimitError(new Error("connection refused")), false);
  });

  it("caps exponential retry delay", () => {
    assert.equal(exponentialBackoffMs(1_000, 1, 30_000), 1_000);
    assert.equal(exponentialBackoffMs(1_000, 3, 30_000), 4_000);
    assert.equal(exponentialBackoffMs(1_000, 20, 30_000), 30_000);
  });

  it("removes complete URLs from errors", () => {
    const message = safeErrorMessage(
      new Error("URL: https://rpc.example/v2/secret-key\nStatus: 429"),
    );
    assert.equal(message.includes("secret-key"), false);
    assert.match(message, /URL: <redacted-url>/u);
    assert.match(message, /Status: 429/u);
  });
});
