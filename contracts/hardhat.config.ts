import path from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import { defineConfig } from "hardhat/config";
import hardhatToolboxMochaEthers from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import type { NetworkUserConfig } from "hardhat/types/config";

const configFilePath = fileURLToPath(import.meta.url);
const configDir = path.dirname(configFilePath);
dotenv.config({ path: path.resolve(configDir, "../.env") });

const creditcoinChainId = Number(process.env.CREDITCOIN_CHAIN_ID ?? "102031");

const accounts = process.env.CREDITCOIN_PRIVATE_KEY
  ? [process.env.CREDITCOIN_PRIVATE_KEY]
  : [];

const sepoliaAccounts = process.env.SEPOLIA_PRIVATE_KEY
  ? [process.env.SEPOLIA_PRIVATE_KEY]
  : [];

const networks: Record<string, NetworkUserConfig> = {
  hardhatMainnet: {
    type: "edr-simulated",
    chainType: "l1"
  },
  creditcoinTestnet: {
    type: "http",
    chainType: "generic",
    url: process.env.CREDITCOIN_RPC_URL ?? "https://rpc.cc3-testnet.creditcoin.network",
    chainId: creditcoinChainId,
    accounts
  }
};

if (process.env.SEPOLIA_RPC_URL) {
  networks.sepolia = {
    type: "http",
    chainType: "l1",
    url: process.env.SEPOLIA_RPC_URL,
    chainId: 11155111,
    accounts: sepoliaAccounts
  };
}

export default defineConfig({
  plugins: [hardhatToolboxMochaEthers],
  chainDescriptors: {
    102031: {
      name: "Creditcoin Testnet",
      blockExplorers: {
        blockscout: {
          name: "Creditcoin Testnet Blockscout",
          url: "https://creditcoin-testnet.blockscout.com",
          apiUrl: "https://creditcoin-testnet.blockscout.com/api"
        }
      }
    }
  },
  verify: {
    blockscout: {
      enabled: true
    },
    etherscan: process.env.ETHERSCAN_API_KEY
      ? {
          apiKey: process.env.ETHERSCAN_API_KEY
        }
      : {
          enabled: false
        },
    sourcify: {
      enabled: false
    }
  },
  solidity: {
    version: "0.8.28",
    settings: {
      viaIR: true,
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks
});
