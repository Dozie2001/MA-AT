import {
  createPublicClient,
  encodePacked,
  getAddress,
  http,
  keccak256,
  parseAbi
} from "viem";

import { config } from "./config.js";

const invoiceRegistryAbi = parseAbi([
  "function getInvoice(bytes32 invoiceId) view returns ((address vendor, address buyer, uint128 amount, uint64 issuedAt, uint64 dueAt, uint64 settledAt, bytes32 metadataHash, uint8 status))",
  "function settlementVerifier() view returns (address)"
]);
const trustRegistryAbi = parseAbi([
  "function getPayerMetrics(address payer) view returns ((uint64 settledInvoiceCount, uint64 onTimeSettlementCount, uint64 lateSettlementCount, uint64 lastSettledAt, uint256 totalPaidUsdc, uint8 tier))",
  "function getVendorMetrics(address vendor) view returns ((uint64 settledInvoiceCount, uint64 lastSettledAt, uint256 totalReceivedUsdc))",
  "function processedInvoiceIds(bytes32 invoiceId) view returns (bool)",
  "function settlementVerifier() view returns (address)"
]);
const settlementVerifierAbi = parseAbi([
  "function invoiceRegistry() view returns (address)",
  "function trustRegistry() view returns (address)",
  "function sourceChainKey() view returns (uint64)",
  "function sourceRouter() view returns (address)",
  "function processedQueries(bytes32 queryKey) view returns (bool)"
]);
const creditPolicyAbi = parseAbi([
  "function trustRegistry() view returns (address)",
  "function creditLimitUsdc(address payer) view returns (uint256)",
  "function canExtendTerms(address payer, uint256 invoiceAmount) view returns (bool)"
]);

function requiredAddress(value: string | undefined, name: string) {
  if (!value) throw new Error(`Missing ${name} in environment`);
  return getAddress(value);
}

async function main() {
  const [invoiceIdArg, chainKeyArg, heightArg, txIndexArg] = process.argv.slice(2);
  if (!invoiceIdArg || !chainKeyArg || !heightArg || !txIndexArg) {
    throw new Error(
      "Usage: npm run verify-settlement -- <invoice-id> <chain-key> <height> <tx-index>"
    );
  }

  const invoiceId = invoiceIdArg as `0x${string}`;
  const chainKey = BigInt(chainKeyArg);
  const height = BigInt(heightArg);
  const txIndex = BigInt(txIndexArg);
  const queryKey = keccak256(
    encodePacked(["uint64", "uint64", "uint64"], [chainKey, height, txIndex])
  );

  const routerAddress = requiredAddress(
    config.settlementRouterAddress,
    "SETTLEMENT_ROUTER_ADDRESS"
  );
  const invoiceRegistryAddress = requiredAddress(
    config.invoiceRegistryAddress,
    "INVOICE_REGISTRY_ADDRESS"
  );
  const verifierAddress = requiredAddress(
    config.settlementVerifierAddress,
    "MAAT_SETTLEMENT_VERIFIER_ADDRESS"
  );
  const trustRegistryAddress = requiredAddress(
    config.trustRegistryAddress,
    "MAAT_TRUST_REGISTRY_ADDRESS"
  );
  const creditPolicyAddress = requiredAddress(
    config.creditPolicyAddress,
    "MAAT_CREDIT_POLICY_ADDRESS"
  );

  const chain = {
    id: config.creditcoinChainId,
    name: "creditcoinTestnet",
    nativeCurrency: { decimals: 18, name: "Creditcoin Testnet", symbol: "tCTC" },
    rpcUrls: { default: { http: [config.creditcoinRpcUrl] } }
  } as const;
  const client = createPublicClient({ chain, transport: http(config.creditcoinRpcUrl) });

  const invoice = await client.readContract({
    address: invoiceRegistryAddress,
    abi: invoiceRegistryAbi,
    functionName: "getInvoice",
    args: [invoiceId]
  });
  const payer = getAddress(invoice.buyer);
  const vendor = getAddress(invoice.vendor);

  const [
    invoiceVerifier,
    trustVerifier,
    verifierInvoiceRegistry,
    verifierTrustRegistry,
    sourceChainKey,
    sourceRouter,
    queryProcessed,
    invoiceProcessed,
    payerMetrics,
    vendorMetrics,
    policyTrustRegistry,
    creditLimit,
    canExtendSameTerms
  ] = await Promise.all([
    client.readContract({ address: invoiceRegistryAddress, abi: invoiceRegistryAbi, functionName: "settlementVerifier" }),
    client.readContract({ address: trustRegistryAddress, abi: trustRegistryAbi, functionName: "settlementVerifier" }),
    client.readContract({ address: verifierAddress, abi: settlementVerifierAbi, functionName: "invoiceRegistry" }),
    client.readContract({ address: verifierAddress, abi: settlementVerifierAbi, functionName: "trustRegistry" }),
    client.readContract({ address: verifierAddress, abi: settlementVerifierAbi, functionName: "sourceChainKey" }),
    client.readContract({ address: verifierAddress, abi: settlementVerifierAbi, functionName: "sourceRouter" }),
    client.readContract({ address: verifierAddress, abi: settlementVerifierAbi, functionName: "processedQueries", args: [queryKey] }),
    client.readContract({ address: trustRegistryAddress, abi: trustRegistryAbi, functionName: "processedInvoiceIds", args: [invoiceId] }),
    client.readContract({ address: trustRegistryAddress, abi: trustRegistryAbi, functionName: "getPayerMetrics", args: [payer] }),
    client.readContract({ address: trustRegistryAddress, abi: trustRegistryAbi, functionName: "getVendorMetrics", args: [vendor] }),
    client.readContract({ address: creditPolicyAddress, abi: creditPolicyAbi, functionName: "trustRegistry" }),
    client.readContract({ address: creditPolicyAddress, abi: creditPolicyAbi, functionName: "creditLimitUsdc", args: [payer] }),
    client.readContract({ address: creditPolicyAddress, abi: creditPolicyAbi, functionName: "canExtendTerms", args: [payer, invoice.amount] })
  ]);

  if (
    getAddress(invoiceVerifier) !== verifierAddress ||
    getAddress(trustVerifier) !== verifierAddress ||
    getAddress(verifierInvoiceRegistry) !== invoiceRegistryAddress ||
    getAddress(verifierTrustRegistry) !== trustRegistryAddress ||
    getAddress(policyTrustRegistry) !== trustRegistryAddress
  ) {
    throw new Error("Settlement deployment wiring is inconsistent");
  }
  if (sourceChainKey !== BigInt(config.sepoliaChainKey) || getAddress(sourceRouter) !== routerAddress) {
    throw new Error("Settlement verifier has the wrong source binding");
  }
  if (invoice.status !== 2 || !queryProcessed || !invoiceProcessed) {
    throw new Error("Invoice is not fully settled and replay-protected");
  }

  console.log(
    JSON.stringify(
      {
        invoiceId,
        invoice: {
          vendor,
          buyer: payer,
          amount: invoice.amount.toString(),
          issuedAt: invoice.issuedAt.toString(),
          dueAt: invoice.dueAt.toString(),
          settledAt: invoice.settledAt.toString(),
          metadataHash: invoice.metadataHash,
          status: invoice.status
        },
        attestation: {
          chainKey: sourceChainKey.toString(),
          routerAddress: getAddress(sourceRouter),
          queryKey,
          queryProcessed
        },
        payerTrust: {
          settledInvoiceCount: payerMetrics.settledInvoiceCount.toString(),
          onTimeSettlementCount: payerMetrics.onTimeSettlementCount.toString(),
          lateSettlementCount: payerMetrics.lateSettlementCount.toString(),
          totalPaidUsdc: payerMetrics.totalPaidUsdc.toString(),
          lastSettledAt: payerMetrics.lastSettledAt.toString(),
          tier: payerMetrics.tier
        },
        vendorActivity: {
          settledInvoiceCount: vendorMetrics.settledInvoiceCount.toString(),
          totalReceivedUsdc: vendorMetrics.totalReceivedUsdc.toString(),
          lastSettledAt: vendorMetrics.lastSettledAt.toString()
        },
        policy: {
          creditLimitUsdc: creditLimit.toString(),
          canExtendSameTerms
        },
        replayProtection: { queryProcessed, invoiceProcessed }
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
