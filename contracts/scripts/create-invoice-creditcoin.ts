import { network } from "hardhat";
import { getAddress, isHexString, parseUnits, Wallet } from "ethers";

const CREDITCOIN_TESTNET_CHAIN_ID = 102_031n;

async function main(): Promise<void> {
  const { ethers } = await network.create("creditcoinTestnet");
  const privateKey = process.env.CREDITCOIN_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("Missing CREDITCOIN_PRIVATE_KEY in environment");
  }

  const registryValue = process.env.INVOICE_REGISTRY_ADDRESS;
  if (!registryValue) {
    throw new Error("Missing INVOICE_REGISTRY_ADDRESS in environment");
  }
  const registryAddress = getAddress(registryValue);

  const [buyerValue, amountValue, dueAtValue, metadataHash] = process.argv.slice(2);
  if (!buyerValue || !amountValue || !dueAtValue || !metadataHash) {
    throw new Error(
      "Usage: npm run invoice:create -- <buyer> <amount-usdc> <due-at-unix> <metadata-hash>"
    );
  }
  const buyer = getAddress(buyerValue);

  const amount = parseUnits(amountValue, 6);
  if (amount <= 0n || amount > (1n << 128n) - 1n) {
    throw new Error("amount-usdc is outside the supported uint128 range");
  }

  const dueAt = BigInt(dueAtValue);
  if (dueAt <= 0n || dueAt > (1n << 64n) - 1n) {
    throw new Error("due-at-unix must be a Unix timestamp in the uint64 range");
  }

  if (!isHexString(metadataHash, 32)) {
    throw new Error("metadata-hash must be a 32-byte hex value");
  }

  const chainId = (await ethers.provider.getNetwork()).chainId;
  if (chainId !== CREDITCOIN_TESTNET_CHAIN_ID) {
    throw new Error(
      `Expected Creditcoin Testnet chain ID ${CREDITCOIN_TESTNET_CHAIN_ID}, received ${chainId}`
    );
  }
  if ((await ethers.provider.getCode(registryAddress)) === "0x") {
    throw new Error(`No contract bytecode at InvoiceRegistry ${registryAddress}`);
  }

  const vendor = new Wallet(privateKey, ethers.provider);
  if (buyer === vendor.address) {
    throw new Error("Invoice buyer must differ from the Creditcoin vendor signer");
  }

  const latestBlock = await ethers.provider.getBlock("latest");
  if (!latestBlock) {
    throw new Error("Could not read latest Creditcoin block");
  }
  if (dueAt <= BigInt(latestBlock.timestamp)) {
    throw new Error(
      `due-at-unix must be later than current chain time ${latestBlock.timestamp}`
    );
  }

  const registry = await ethers.getContractAt("InvoiceRegistry", registryAddress, vendor);
  const transaction = await registry.createInvoice(buyer, amount, dueAt, metadataHash);
  const receipt = await transaction.wait();
  if (!receipt || receipt.status !== 1) {
    throw new Error("Invoice creation transaction did not succeed");
  }

  const createdLog = receipt.logs
    .map((log: { topics: readonly string[]; data: string }) => {
      try {
        return registry.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((log: { name: string } | null) => log?.name === "InvoiceCreated");
  if (!createdLog) {
    throw new Error("InvoiceCreated event missing from successful receipt");
  }

  const invoiceId = createdLog.args.invoiceId as string;
  const invoice = await registry.getInvoice(invoiceId);
  if (
    invoice.vendor !== vendor.address ||
    invoice.buyer !== buyer ||
    invoice.amount !== amount ||
    invoice.dueAt !== dueAt ||
    invoice.metadataHash !== metadataHash ||
    invoice.status !== 1n
  ) {
    throw new Error("Stored invoice state does not match requested invoice");
  }

  console.log(`InvoiceId=${invoiceId}`);
  console.log(`Vendor=${vendor.address}`);
  console.log(`Buyer=${buyer}`);
  console.log(`AmountUsdc=${amountValue}`);
  console.log(`DueAt=${dueAt}`);
  console.log(`TransactionHash=${receipt.hash}`);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
