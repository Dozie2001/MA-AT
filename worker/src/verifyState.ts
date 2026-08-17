import {
  createPublicClient,
  encodePacked,
  getAddress,
  http,
  keccak256,
  parseAbi
} from "viem";

import { config } from "./config.js";

const coreAbi = parseAbi([
  "function getMetrics(address agent) view returns ((uint256 executionCount, uint256 successCount, uint256 totalVolume, uint256 lastSeenAt, uint8 tier))",
  "function processedExecutionIds(bytes32 executionId) view returns (bool)",
  "function verifier() view returns (address)"
]);

const verifierAbi = parseAbi([
  "function maatCore() view returns (address)",
  "function processedQueries(bytes32 queryKey) view returns (bool)",
  "function sourceChainKey() view returns (uint64)",
  "function sourceReporter() view returns (address)"
]);

const policyAbi = parseAbi([
  "function maatCore() view returns (address)",
  "function canOperate(address agent) view returns (bool)",
  "function delegationCap(address agent) view returns (uint256)"
]);

function requiredAddress(value: string | undefined, name: string) {
  if (!value) {
    throw new Error(`Missing ${name} in environment`);
  }

  return getAddress(value);
}

async function main() {
  const [agentArg, chainKeyArg, heightArg, txIndexArg, executionIdArg] = process.argv.slice(2);
  if (!agentArg || !chainKeyArg || !heightArg || !txIndexArg || !executionIdArg) {
    throw new Error(
      "Usage: npm run verify-state -- <agent> <chain-key> <height> <tx-index> <execution-id>"
    );
  }

  const agent = getAddress(agentArg);
  const chainKey = BigInt(chainKeyArg);
  const height = BigInt(heightArg);
  const txIndex = BigInt(txIndexArg);
  const executionId = executionIdArg as `0x${string}`;
  const queryKey = keccak256(
    encodePacked(["uint64", "uint64", "uint64"], [chainKey, height, txIndex])
  );

  const coreAddress = requiredAddress(config.maatCoreAddress, "MAAT_CORE_ADDRESS");
  const verifierAddress = requiredAddress(
    config.maatVerifierAddress,
    "MAAT_VERIFIER_ADDRESS"
  );
  const policyAddress = requiredAddress(config.maatPolicyAddress, "MAAT_POLICY_ADDRESS");
  const sourceReporterAddress = requiredAddress(
    config.executionReporterAddress,
    "EXECUTION_REPORTER_ADDRESS"
  );

  const chain = {
    id: config.creditcoinChainId,
    name: "creditcoinTestnet",
    nativeCurrency: { decimals: 18, name: "Creditcoin Testnet", symbol: "tCTC" },
    rpcUrls: { default: { http: [config.creditcoinRpcUrl] } }
  } as const;
  const client = createPublicClient({ chain, transport: http(config.creditcoinRpcUrl) });

  const [
    metrics,
    executionProcessed,
    configuredVerifier,
    verifierCore,
    queryProcessed,
    configuredSourceChainKey,
    configuredSourceReporter,
    policyCore,
    canOperate,
    delegationCap
  ] = await Promise.all([
    client.readContract({ address: coreAddress, abi: coreAbi, functionName: "getMetrics", args: [agent] }),
    client.readContract({
      address: coreAddress,
      abi: coreAbi,
      functionName: "processedExecutionIds",
      args: [executionId]
    }),
    client.readContract({ address: coreAddress, abi: coreAbi, functionName: "verifier" }),
    client.readContract({ address: verifierAddress, abi: verifierAbi, functionName: "maatCore" }),
    client.readContract({
      address: verifierAddress,
      abi: verifierAbi,
      functionName: "processedQueries",
      args: [queryKey]
    }),
    client.readContract({
      address: verifierAddress,
      abi: verifierAbi,
      functionName: "sourceChainKey"
    }),
    client.readContract({
      address: verifierAddress,
      abi: verifierAbi,
      functionName: "sourceReporter"
    }),
    client.readContract({ address: policyAddress, abi: policyAbi, functionName: "maatCore" }),
    client.readContract({
      address: policyAddress,
      abi: policyAbi,
      functionName: "canOperate",
      args: [agent]
    }),
    client.readContract({
      address: policyAddress,
      abi: policyAbi,
      functionName: "delegationCap",
      args: [agent]
    })
  ]);

  if (getAddress(configuredVerifier) !== verifierAddress) {
    throw new Error("MaatCore verifier does not match MAAT_VERIFIER_ADDRESS");
  }
  if (getAddress(verifierCore) !== coreAddress || getAddress(policyCore) !== coreAddress) {
    throw new Error("Verifier or policy is wired to the wrong MaatCore address");
  }
  if (
    configuredSourceChainKey !== BigInt(config.sepoliaChainKey) ||
    getAddress(configuredSourceReporter) !== sourceReporterAddress
  ) {
    throw new Error("MaatVerifier is bound to the wrong source chain or reporter");
  }
  if (!executionProcessed || !queryProcessed) {
    throw new Error("Accepted execution or source query is not replay-protected");
  }

  console.log(
    JSON.stringify(
      {
        agent,
        queryKey,
        wiring: { coreAddress, verifierAddress, policyAddress },
        attestationSource: {
          chainKey: configuredSourceChainKey.toString(),
          reporterAddress: getAddress(configuredSourceReporter)
        },
        metrics: {
          executionCount: metrics.executionCount.toString(),
          successCount: metrics.successCount.toString(),
          totalVolume: metrics.totalVolume.toString(),
          lastSeenAt: metrics.lastSeenAt.toString(),
          tier: metrics.tier
        },
        replayProtection: { executionProcessed, queryProcessed },
        policy: { canOperate, delegationCap: delegationCap.toString() }
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
