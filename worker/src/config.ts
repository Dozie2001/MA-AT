import path from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";

const configFilePath = fileURLToPath(import.meta.url);
const configDir = path.dirname(configFilePath);
dotenv.config({ path: path.resolve(configDir, "../../.env") });

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function positiveInteger(name: string, fallback: string): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function positiveBigInt(name: string, fallback: string): bigint {
  const value = BigInt(process.env[name] ?? fallback);
  if (value <= 0n) throw new Error(`${name} must be a positive integer`);
  return value;
}

export const config = {
  sepoliaRpcUrl: requireEnv("SEPOLIA_RPC_URL"),
  creditcoinRpcUrl: requireEnv("CREDITCOIN_RPC_URL"),
  creditcoinWsUrl: process.env.CREDITCOIN_WS_URL ?? "wss://rpc.cc3-testnet.creditcoin.network",
  creditcoinChainId: positiveInteger("CREDITCOIN_CHAIN_ID", "102031"),
  proofApiUrl: requireEnv("ATTESTCOIN_PROOF_API_URL"),
  sepoliaChainKey: positiveInteger("ATTESTCOIN_CHAIN_KEY_SEPOLIA", "1"),
  settlementRouterDeploymentBlock: positiveBigInt(
    "SETTLEMENT_ROUTER_DEPLOYMENT_BLOCK",
    "11508491"
  ),
  settlementScanChunkSize: positiveBigInt("SETTLEMENT_SCAN_CHUNK_SIZE", "10"),
  settlementPollIntervalMs: positiveInteger("SETTLEMENT_POLL_INTERVAL_MS", "15000"),
  settlementRetryIntervalMs: positiveInteger("SETTLEMENT_RETRY_INTERVAL_MS", "30000"),
  settlementCursorFile:
    process.env.SETTLEMENT_CURSOR_FILE ??
    path.resolve(configDir, "../.data/settlement-cursor.json"),
  executionReporterAddress: process.env.EXECUTION_REPORTER_ADDRESS ?? "",
  maatCoreAddress: process.env.MAAT_CORE_ADDRESS ?? "",
  maatVerifierAddress: process.env.MAAT_VERIFIER_ADDRESS ?? "",
  maatPolicyAddress: process.env.MAAT_POLICY_ADDRESS ?? "",
  settlementRouterAddress: process.env.SETTLEMENT_ROUTER_ADDRESS ?? "",
  invoiceRegistryAddress: process.env.INVOICE_REGISTRY_ADDRESS ?? "",
  settlementVerifierAddress: process.env.MAAT_SETTLEMENT_VERIFIER_ADDRESS ?? "",
  trustRegistryAddress: process.env.MAAT_TRUST_REGISTRY_ADDRESS ?? "",
  creditPolicyAddress: process.env.MAAT_CREDIT_POLICY_ADDRESS ?? ""
};
