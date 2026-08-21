import { Contract, getAddress, JsonRpcProvider, Wallet } from "ethers";

const SEPOLIA_CHAIN_ID = 11_155_111n;
const CREDITCOIN_TESTNET_CHAIN_ID = 102_031n;
const SEPOLIA_ATTESTCOIN_CHAIN_KEY = 1n;
const OFFICIAL_SEPOLIA_USDC = getAddress(
  "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238"
);
const VERIFIER_PRECOMPILE = getAddress(
  "0x0000000000000000000000000000000000000FD2"
);

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} in environment`);
  return value;
}

async function requireCode(
  provider: JsonRpcProvider,
  address: string,
  label: string
): Promise<void> {
  if ((await provider.getCode(address)) === "0x") {
    throw new Error(`No deployed bytecode for ${label} at ${address}`);
  }
}

async function main(): Promise<void> {
  const sepoliaProvider = new JsonRpcProvider(required("SEPOLIA_RPC_URL"));
  const creditcoinProvider = new JsonRpcProvider(required("CREDITCOIN_RPC_URL"));
  const owner = new Wallet(required("SEPOLIA_PRIVATE_KEY")).address;

  const routerAddress = getAddress(required("SETTLEMENT_ROUTER_ADDRESS"));
  const invoiceRegistryAddress = getAddress(required("INVOICE_REGISTRY_ADDRESS"));
  const trustRegistryAddress = getAddress(required("MAAT_TRUST_REGISTRY_ADDRESS"));
  const verifierAddress = getAddress(required("MAAT_SETTLEMENT_VERIFIER_ADDRESS"));
  const policyAddress = getAddress(required("MAAT_CREDIT_POLICY_ADDRESS"));

  const [sepoliaNetwork, creditcoinNetwork] = await Promise.all([
    sepoliaProvider.getNetwork(),
    creditcoinProvider.getNetwork()
  ]);
  if (sepoliaNetwork.chainId !== SEPOLIA_CHAIN_ID) {
    throw new Error(`Sepolia RPC returned unexpected chain ID ${sepoliaNetwork.chainId}`);
  }
  if (creditcoinNetwork.chainId !== CREDITCOIN_TESTNET_CHAIN_ID) {
    throw new Error(
      `Creditcoin RPC returned unexpected chain ID ${creditcoinNetwork.chainId}`
    );
  }

  await Promise.all([
    requireCode(sepoliaProvider, routerAddress, "SettlementRouter"),
    requireCode(creditcoinProvider, invoiceRegistryAddress, "InvoiceRegistry"),
    requireCode(creditcoinProvider, trustRegistryAddress, "MaatTrustRegistry"),
    requireCode(creditcoinProvider, verifierAddress, "MaatSettlementVerifier"),
    requireCode(creditcoinProvider, policyAddress, "MaatCreditPolicy")
  ]);

  const router = new Contract(
    routerAddress,
    [
      "function usdc() view returns (address)",
      "function owner() view returns (address)",
      "function paused() view returns (bool)"
    ],
    sepoliaProvider
  );
  const invoiceRegistry = new Contract(
    invoiceRegistryAddress,
    ["function settlementVerifier() view returns (address)"],
    creditcoinProvider
  );
  const trustRegistry = new Contract(
    trustRegistryAddress,
    ["function settlementVerifier() view returns (address)"],
    creditcoinProvider
  );
  const verifier = new Contract(
    verifierAddress,
    [
      "function VERIFIER() view returns (address)",
      "function invoiceRegistry() view returns (address)",
      "function trustRegistry() view returns (address)",
      "function sourceChainKey() view returns (uint64)",
      "function sourceRouter() view returns (address)",
      "function MAX_BATCH_SIZE() view returns (uint256)"
    ],
    creditcoinProvider
  );
  const policy = new Contract(
    policyAddress,
    ["function trustRegistry() view returns (address)"],
    creditcoinProvider
  );

  const [
    routerUsdc,
    routerOwner,
    routerPaused,
    invoiceVerifier,
    trustVerifier,
    nativeVerifier,
    verifierInvoiceRegistry,
    verifierTrustRegistry,
    sourceChainKey,
    sourceRouter,
    maxBatchSize,
    policyTrustRegistry
  ] = await Promise.all([
    router.usdc(),
    router.owner(),
    router.paused(),
    invoiceRegistry.settlementVerifier(),
    trustRegistry.settlementVerifier(),
    verifier.VERIFIER(),
    verifier.invoiceRegistry(),
    verifier.trustRegistry(),
    verifier.sourceChainKey(),
    verifier.sourceRouter(),
    verifier.MAX_BATCH_SIZE(),
    policy.trustRegistry()
  ]);

  if (getAddress(routerUsdc as string) !== OFFICIAL_SEPOLIA_USDC) {
    throw new Error("SettlementRouter is bound to the wrong token");
  }
  if (getAddress(routerOwner as string) !== owner || routerPaused !== false) {
    throw new Error("SettlementRouter ownership or pause state is unexpected");
  }
  if (
    getAddress(invoiceVerifier as string) !== verifierAddress ||
    getAddress(trustVerifier as string) !== verifierAddress
  ) {
    throw new Error("Registry verifier authority handoff is inconsistent");
  }
  if (
    getAddress(nativeVerifier as string) !== VERIFIER_PRECOMPILE ||
    getAddress(verifierInvoiceRegistry as string) !== invoiceRegistryAddress ||
    getAddress(verifierTrustRegistry as string) !== trustRegistryAddress ||
    sourceChainKey !== SEPOLIA_ATTESTCOIN_CHAIN_KEY ||
    getAddress(sourceRouter as string) !== routerAddress ||
    maxBatchSize !== 10n
  ) {
    throw new Error("MaatSettlementVerifier immutable binding is inconsistent");
  }
  if (getAddress(policyTrustRegistry as string) !== trustRegistryAddress) {
    throw new Error("MaatCreditPolicy trust registry binding is inconsistent");
  }

  console.log(
    JSON.stringify(
      {
        settlementRouter: {
          address: routerAddress,
          usdc: OFFICIAL_SEPOLIA_USDC,
          owner,
          paused: routerPaused,
          explorer: `https://sepolia.etherscan.io/address/${routerAddress}`
        },
        invoiceRegistry: invoiceRegistryAddress,
        trustRegistry: trustRegistryAddress,
        settlementVerifier: {
          address: verifierAddress,
          nativeVerifier: VERIFIER_PRECOMPILE,
          sourceChainKey: sourceChainKey.toString(),
          sourceRouter: getAddress(sourceRouter as string),
          maxBatchSize: maxBatchSize.toString()
        },
        creditPolicy: policyAddress,
        creditcoinExplorer: `https://creditcoin-testnet.blockscout.com/address/${verifierAddress}`,
        verified: true
      },
      null,
      2
    )
  );
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
