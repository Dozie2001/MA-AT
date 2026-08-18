import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import type { Address } from "viem";

import { loadCursor, saveCursor } from "./cursorStore.js";

const routerAddress = "0x0000000000000000000000000000000000000001" as Address;

describe("cursorStore", () => {
  it("starts at deployment when no checkpoint exists", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "maat-cursor-"));
    try {
      const cursor = await loadCursor({
        filePath: path.join(directory, "cursor.json"),
        chainId: 11155111,
        routerAddress,
        deploymentBlock: 100n
      });
      assert.deepEqual(cursor, { nextBlock: 100n, restored: false });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("atomically saves and restores the next block", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "maat-cursor-"));
    const filePath = path.join(directory, "cursor.json");
    try {
      await saveCursor({
        filePath,
        chainId: 11155111,
        routerAddress,
        nextBlock: 250n
      });
      const cursor = await loadCursor({
        filePath,
        chainId: 11155111,
        routerAddress,
        deploymentBlock: 100n
      });
      assert.deepEqual(cursor, { nextBlock: 250n, restored: true });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("rejects a checkpoint for a different router", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "maat-cursor-"));
    const filePath = path.join(directory, "cursor.json");
    try {
      await saveCursor({
        filePath,
        chainId: 11155111,
        routerAddress,
        nextBlock: 250n
      });
      await assert.rejects(
        loadCursor({
          filePath,
          chainId: 11155111,
          routerAddress: "0x0000000000000000000000000000000000000002",
          deploymentBlock: 100n
        }),
        /does not match/
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
