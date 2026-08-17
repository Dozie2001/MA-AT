import { createConfig, http } from 'wagmi'
import { creditCoin3Testnet, sepolia } from 'wagmi/chains'
import { injected } from 'wagmi/connectors'

const sepoliaRpcUrl = import.meta.env.VITE_SEPOLIA_RPC_URL?.trim()

export const wagmiConfig = createConfig({
  chains: [creditCoin3Testnet, sepolia],
  connectors: [injected({ unstable_shimAsyncInject: 2_000 })],
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
