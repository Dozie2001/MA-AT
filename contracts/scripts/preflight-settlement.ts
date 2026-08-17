import {
  Contract,
  formatEther,
  formatUnits,
  getAddress,
  JsonRpcProvider,
  Wallet
} from "ethers";

const SEPOLIA_CHAIN_ID = 11_155_111n;
const CREDITCOIN_TESTNET_CHAIN_ID = 102_031n;
const SEPOLIA_ATTESTCOIN_CHAIN_KEY = 1;
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

async function main(): Promise<void> {
  const sepoliaProvider = new JsonRpcProvider(required("SEPOLIA_RPC_URL"));
  const creditcoinProvider = new JsonRpcProvider(required("CREDITCOIN_RPC_URL"));
  const sepoliaSigner = new Wallet(required("SEPOLIA_PRIVATE_KEY"), sepoliaProvider);
  const creditcoinSigner = new Wallet(
    required("CREDITCOIN_PRIVATE_KEY"),
    creditcoinProvider
  );
  const vendorSigner = new Wallet(required("VENDOR_PRIVATE_KEY"), creditcoinProvider);
  if (vendorSigner.address === sepoliaSigner.address) {
    throw new Error("VENDOR_PRIVATE_KEY must derive a different address from the buyer");
  }

  const configuredCreditcoinChainId = Number(required("CREDITCOIN_CHAIN_ID"));
  if (configuredCreditcoinChainId !== Number(CREDITCOIN_TESTNET_CHAIN_ID)) {
    throw new Error(
      `CREDITCOIN_CHAIN_ID must be ${CREDITCOIN_TESTNET_CHAIN_ID}, received ${configuredCreditcoinChainId}`
    );
  }
  const configuredSourceChainKey = Number(required("ATTESTCOIN_CHAIN_KEY_SEPOLIA"));
  if (configuredSourceChainKey !== SEPOLIA_ATTESTCOIN_CHAIN_KEY) {
    throw new Error(
      `ATTESTCOIN_CHAIN_KEY_SEPOLIA must be ${SEPOLIA_ATTESTCOIN_CHAIN_KEY}, received ${configuredSourceChainKey}`
    );
  }
  const configuredUsdc = getAddress(required("SEPOLIA_USDC_ADDRESS"));
  if (configuredUsdc !== OFFICIAL_SEPOLIA_USDC) {
    throw new Error(`SEPOLIA_USDC_ADDRESS must be ${OFFICIAL_SEPOLIA_USDC}`);
  }

  const [sepoliaNetwork, creditcoinNetwork] = await Promise.all([
    sepoliaProvider.getNetwork(),
    creditcoinProvider.getNetwork()
  ]);
  if (sepoliaNetwork.chainId !== SEPOLIA_CHAIN_ID) {
    throw new Error(
      `Sepolia RPC returned chain ID ${sepoliaNetwork.chainId}, expected ${SEPOLIA_CHAIN_ID}`
    );
  }
  if (creditcoinNetwork.chainId !== CREDITCOIN_TESTNET_CHAIN_ID) {
    throw new Error(
      `Creditcoin RPC returned chain ID ${creditcoinNetwork.chainId}, expected ${CREDITCOIN_TESTNET_CHAIN_ID}`
    );
  }

  const [usdcCode, sepoliaEth, creditcoinCtc, vendorCtc] = await Promise.all([
    sepoliaProvider.getCode(configuredUsdc),
    sepoliaProvider.getBalance(sepoliaSigner.address),
    creditcoinProvider.getBalance(creditcoinSigner.address),
    creditcoinProvider.getBalance(vendorSigner.address)
  ]);
  if (usdcCode === "0x") {
    throw new Error(`No bytecode at official Sepolia USDC ${configuredUsdc}`);
  }

  const verifier = new Contract(
    VERIFIER_PRECOMPILE,
    [
      "function calculateTxIndex((bytes32 root,(bytes32 hash,bool isLeft)[] siblings) merkleProof) view returns (uint64)"
    ],
    creditcoinProvider
  );
  const precompileProbe = (await verifier.calculateTxIndex({
    root: `0x${"00".repeat(32)}`,
    siblings: []
  })) as bigint;
  if (precompileProbe !== 0n) {
    throw new Error(`Unexpected verifier precompile probe result ${precompileProbe}`);
  }

  const usdc = new Contract(
    configuredUsdc,
    [
      "function decimals() view returns (uint8)",
      "function balanceOf(address account) view returns (uint256)"
    ],
    sepoliaProvider
  );
  const [usdcDecimals, sepoliaUsdc] = (await Promise.all([
    usdc.decimals(),
    usdc.balanceOf(sepoliaSigner.address)
  ])) as [bigint, bigint];
  if (usdcDecimals !== 6n) {
    throw new Error(`Official Sepolia USDC returned ${usdcDecimals} decimals, expected 6`);
  }

  const proofApiUrl = required("ATTESTCOIN_PROOF_API_URL").replace(/\/$/, "");
  const proofResponse = await fetch(
    `${proofApiUrl}/api/v1/attested-height/${SEPOLIA_ATTESTCOIN_CHAIN_KEY}`,
    { headers: { accept: "application/json" } }
  );
  if (!proofResponse.ok) {
    throw new Error(`Attestcoin proof API returned HTTP ${proofResponse.status}`);
  }
  const proofPayload = (await proofResponse.json()) as { attestedHeight?: unknown };
  if (
    proofPayload.attestedHeight !== null &&
    typeof proofPayload.attestedHeight !== "number"
  ) {
    throw new Error("Attestcoin proof API returned an unexpected attested-height shape");
  }

  console.log(
    JSON.stringify(
      {
        sepolia: {
          chainId: sepoliaNetwork.chainId.toString(),
          signer: sepoliaSigner.address,
          ethBalance: formatEther(sepoliaEth),
          usdc: configuredUsdc,
          usdcDecimals: usdcDecimals.toString(),
          usdcBalance: formatUnits(sepoliaUsdc, usdcDecimals)
        },
        creditcoinTestnet: {
          chainId: creditcoinNetwork.chainId.toString(),
          signer: creditcoinSigner.address,
          ctcBalance: formatEther(creditcoinCtc),
          verifierPrecompile: VERIFIER_PRECOMPILE,
          verifierCalculateTxIndexProbe: precompileProbe.toString()
        },
        vendor: {
          address: vendorSigner.address,
          ctcBalance: formatEther(vendorCtc),
          distinctFromBuyer: true
        },
        signerAddressesMatch: sepoliaSigner.address === creditcoinSigner.address,
        attestcoin: {
          sourceChainKey: SEPOLIA_ATTESTCOIN_CHAIN_KEY,
          attestedHeight: proofPayload.attestedHeight
        }
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
