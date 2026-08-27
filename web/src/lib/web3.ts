import { createConfig } from '@privy-io/wagmi'
import { http } from 'wagmi'
import { creditCoin3Testnet, sepolia } from 'wagmi/chains'

const sepoliaRpcUrl = import.meta.env.VITE_SEPOLIA_RPC_URL?.trim()

export const wagmiConfig = createConfig({
  chains: [creditCoin3Testnet, sepolia],
  transports: {
    [creditCoin3Testnet.id]: http(),
    [sepolia.id]: http(sepoliaRpcUrl || undefined),
  },
  ssr: true,
})

declare module 'wagmi' {
  interface Register {
    config: typeof wagmiConfig
  }
}

export { creditCoin3Testnet, sepolia }
