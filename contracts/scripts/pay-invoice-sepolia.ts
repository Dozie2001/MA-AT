import { network } from "hardhat";
import { getAddress, isHexString, parseUnits, Wallet } from "ethers";

const SEPOLIA_CHAIN_ID = 11_155_111n;
const OFFICIAL_SEPOLIA_USDC = getAddress(
  "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238"
);

async function main(): Promise<void> {
  const { ethers } = await network.create("sepolia");
  const privateKey = process.env.SEPOLIA_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("Missing SEPOLIA_PRIVATE_KEY in environment");
  }

  const routerValue = process.env.SETTLEMENT_ROUTER_ADDRESS;
  if (!routerValue) {
    throw new Error("Missing SETTLEMENT_ROUTER_ADDRESS in environment");
  }
  const routerAddress = getAddress(routerValue);

  const [invoiceId, vendorValue, amountValue] = process.argv.slice(2);
  if (!invoiceId || !vendorValue || !amountValue) {
    throw new Error(
      "Usage: npm run invoice:pay -- <invoice-id> <vendor> <amount-usdc>"
    );
  }
  const vendor = getAddress(vendorValue);

  if (!isHexString(invoiceId, 32)) {
    throw new Error("invoice-id must be a 32-byte hex value");
  }

  const amount = parseUnits(amountValue, 6);
  if (amount <= 0n) {
    throw new Error("amount-usdc must be greater than zero");
  }

  const chainId = (await ethers.provider.getNetwork()).chainId;
  if (chainId !== SEPOLIA_CHAIN_ID) {
    throw new Error(`Expected Sepolia chain ID ${SEPOLIA_CHAIN_ID}, received ${chainId}`);
  }
  if ((await ethers.provider.getCode(routerAddress)) === "0x") {
    throw new Error(`No contract bytecode at SettlementRouter ${routerAddress}`);
  }

  const payer = new Wallet(privateKey, ethers.provider);
  if (payer.address === vendor) {
    throw new Error("Invoice vendor must differ from the Sepolia payer signer");
  }

  const router = await ethers.getContractAt("SettlementRouter", routerAddress, payer);
  const usdcAddress = getAddress(await router.usdc());
  if (usdcAddress !== OFFICIAL_SEPOLIA_USDC) {
    throw new Error(
      `Router token ${usdcAddress} is not official Sepolia USDC ${OFFICIAL_SEPOLIA_USDC}`
    );
  }

  const usdc = new ethers.Contract(
    usdcAddress,
    [
      "function allowance(address owner,address spender) view returns (uint256)",
      "function approve(address spender,uint256 amount) returns (bool)",
      "function balanceOf(address account) view returns (uint256)"
    ],
    payer
  );
  const payerBalance = (await usdc.balanceOf(payer.address)) as bigint;
  if (payerBalance < amount) {
    throw new Error(
      `Insufficient Sepolia USDC: payer has ${payerBalance} base units, needs ${amount}`
    );
  }

  const currentAllowance = (await usdc.allowance(payer.address, routerAddress)) as bigint;
  if (currentAllowance < amount) {
    if (currentAllowance !== 0n) {
      const resetReceipt = await (await usdc.approve(routerAddress, 0n)).wait();
      if (!resetReceipt || resetReceipt.status !== 1) {
        throw new Error("USDC allowance reset failed");
      }
    }
    const approvalReceipt = await (await usdc.approve(routerAddress, amount)).wait();
    if (!approvalReceipt || approvalReceipt.status !== 1) {
      throw new Error("USDC approval failed");
    }
    console.log(`ApprovalTransactionHash=${approvalReceipt.hash}`);
  }

  const vendorBalanceBefore = (await usdc.balanceOf(vendor)) as bigint;
  const transaction = await router.payInvoice(invoiceId, vendor, amount);
  const receipt = await transaction.wait();
  if (!receipt || receipt.status !== 1) {
    throw new Error("Invoice payment transaction did not succeed");
  }

  const paymentLogs = receipt.logs
    .map((log: { topics: readonly string[]; data: string }) => {
      try {
        return router.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .filter((log: { name: string } | null) => log?.name === "InvoicePaid");
  if (paymentLogs.length !== 1) {
    throw new Error(`Expected exactly one InvoicePaid event, received ${paymentLogs.length}`);
  }
  const payment = paymentLogs[0];
  if (
    payment.args.invoiceId !== invoiceId ||
    payment.args.payer !== payer.address ||
    payment.args.vendor !== vendor ||
    payment.args.amount !== amount
  ) {
    throw new Error("InvoicePaid event does not match requested payment");
  }

  const vendorBalanceAfter = (await usdc.balanceOf(vendor)) as bigint;
  if (vendorBalanceAfter - vendorBalanceBefore !== amount) {
    throw new Error("Vendor USDC balance did not increase by the exact invoice amount");
  }

  console.log(`InvoiceId=${invoiceId}`);
  console.log(`Payer=${payer.address}`);
  console.log(`Vendor=${vendor}`);
  console.log(`AmountUsdc=${amountValue}`);
  console.log(`PaidAt=${payment.args.paidAt}`);
  console.log(`TransactionHash=${receipt.hash}`);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
