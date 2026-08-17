import { network } from "hardhat";
import { getAddress, Wallet } from "ethers";

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

  const configuredUsdc = process.env.SEPOLIA_USDC_ADDRESS;
  if (!configuredUsdc) {
    throw new Error("Missing SEPOLIA_USDC_ADDRESS in environment");
  }
  const usdcAddress = getAddress(configuredUsdc);
  if (usdcAddress !== OFFICIAL_SEPOLIA_USDC) {
    throw new Error(
      `SEPOLIA_USDC_ADDRESS must be official Sepolia USDC ${OFFICIAL_SEPOLIA_USDC}`
    );
  }

  const chainId = (await ethers.provider.getNetwork()).chainId;
  if (chainId !== SEPOLIA_CHAIN_ID) {
    throw new Error(`Expected Sepolia chain ID ${SEPOLIA_CHAIN_ID}, received ${chainId}`);
  }
  if ((await ethers.provider.getCode(usdcAddress)) === "0x") {
    throw new Error(`No contract bytecode at configured USDC address ${usdcAddress}`);
  }

  const deployer = new Wallet(privateKey, ethers.provider);
  const usdc = new ethers.Contract(
    usdcAddress,
    ["function decimals() view returns (uint8)"],
    ethers.provider
  );
  const decimals = (await usdc.decimals()) as bigint;
  if (decimals !== 6n) {
    throw new Error(`Expected USDC to use 6 decimals, received ${decimals}`);
  }

  const routerFactory = await ethers.getContractFactory("SettlementRouter", deployer);
  const router = await routerFactory.deploy(usdcAddress, deployer.address);
  await router.waitForDeployment();

  const routerAddress = await router.getAddress();
  if ((await router.usdc()) !== usdcAddress) {
    throw new Error("SettlementRouter USDC immutable does not match deployment input");
  }
  if ((await router.owner()) !== deployer.address) {
    throw new Error("SettlementRouter owner does not match deployer");
  }

  console.log(`SettlementRouter=${routerAddress}`);
  console.log(`USDC=${usdcAddress}`);
  console.log(`Owner=${deployer.address}`);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
