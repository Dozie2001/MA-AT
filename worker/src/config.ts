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

export const config = {
  sepoliaRpcUrl: requireEnv("SEPOLIA_RPC_URL"),
  creditcoinRpcUrl: requireEnv("CREDITCOIN_RPC_URL"),
  creditcoinWsUrl: process.env.CREDITCOIN_WS_URL ?? "wss://rpc.cc3-testnet.creditcoin.network",
  creditcoinChainId: Number(process.env.CREDITCOIN_CHAIN_ID ?? "102031"),
  proofApiUrl: requireEnv("ATTESTCOIN_PROOF_API_URL"),
  sepoliaChainKey: Number(process.env.ATTESTCOIN_CHAIN_KEY_SEPOLIA ?? "1"),
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
