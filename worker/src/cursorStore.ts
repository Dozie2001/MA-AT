import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import type { Address } from "viem";

type CursorRecord = {
  chainId: number;
  routerAddress: Address;
  nextBlock: string;
  updatedAt: string;
};

export async function loadCursor(options: {
  filePath: string;
  chainId: number;
  routerAddress: Address;
  deploymentBlock: bigint;
}): Promise<{ nextBlock: bigint; restored: boolean }> {
  let contents: string;
  try {
    contents = await readFile(options.filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { nextBlock: options.deploymentBlock, restored: false };
    }
    throw error;
  }

  const record = JSON.parse(contents) as Partial<CursorRecord>;
  if (
    record.chainId !== options.chainId ||
    record.routerAddress?.toLowerCase() !== options.routerAddress.toLowerCase() ||
    typeof record.nextBlock !== "string"
  ) {
    throw new Error("Settlement cursor does not match the configured chain and router");
  }

  const nextBlock = BigInt(record.nextBlock);
  if (nextBlock < options.deploymentBlock) {
    throw new Error("Settlement cursor predates the verified router deployment");
  }

  return { nextBlock, restored: true };
}

export async function saveCursor(options: {
  filePath: string;
  chainId: number;
  routerAddress: Address;
  nextBlock: bigint;
}): Promise<void> {
  const directory = path.dirname(options.filePath);
  const temporaryPath = `${options.filePath}.tmp`;
  const record: CursorRecord = {
    chainId: options.chainId,
    routerAddress: options.routerAddress,
    nextBlock: options.nextBlock.toString(),
    updatedAt: new Date().toISOString()
  };

  await mkdir(directory, { recursive: true });
  await writeFile(temporaryPath, `${JSON.stringify(record, null, 2)}\n`, {
    mode: 0o600
  });
  await rename(temporaryPath, options.filePath);
}
