import { createPublicClient, formatEther, http } from "/opt/maat/worker/node_modules/viem/_esm/index.js";
import { privateKeyToAccount } from "/opt/maat/worker/node_modules/viem/_esm/accounts/index.js";

const rpcUrl = process.env.CREDITCOIN_RPC_URL;
const configuredChainId = Number(process.env.CREDITCOIN_CHAIN_ID);
const configuredPrivateKey = process.env.CREDITCOIN_PRIVATE_KEY;

if (!rpcUrl || !configuredPrivateKey || !Number.isInteger(configuredChainId)) {
  throw new Error("Required Creditcoin signer configuration is missing");
}

const privateKey = configuredPrivateKey.startsWith("0x")
  ? configuredPrivateKey
  : `0x${configuredPrivateKey}`;
const account = privateKeyToAccount(privateKey);
const client = createPublicClient({ transport: http(rpcUrl) });

const [rpcChainId, balance] = await Promise.all([
  client.getChainId(),
  client.getBalance({ address: account.address }),
]);

if (rpcChainId !== configuredChainId) {
  throw new Error(
    `RPC chain ID ${rpcChainId} does not match configured chain ID ${configuredChainId}`,
  );
}

if (balance === 0n) {
  throw new Error(`Creditcoin signer ${account.address} has no native testnet balance`);
}

console.log("Creditcoin signer readiness check passed");
console.log(`Chain ID: ${rpcChainId}`);
console.log(`Signer address: ${account.address}`);
console.log(`Native balance: ${formatEther(balance)} tCTC`);
