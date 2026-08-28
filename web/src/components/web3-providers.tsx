import { PrivyProvider } from '@privy-io/react-auth'
import { WagmiProvider } from '@privy-io/wagmi'

import { creditCoin3Testnet, sepolia, wagmiConfig } from '../lib/web3'

const privyAppId = import.meta.env.VITE_PRIVY_APP_ID?.trim()

export function Web3Providers({ children }: { children: React.ReactNode }) {
  if (!privyAppId) {
    return (
      <main className="not-found-page">
        <span className="eyebrow">CONFIGURATION REQUIRED</span>
        <h1>Wallet access is not configured.</h1>
        <p>Set VITE_PRIVY_APP_ID for this deployment and rebuild Ma'at.</p>
      </main>
    )
  }

  return (
    <PrivyProvider
      appId={privyAppId}
      config={{
        loginMethods: ['email', 'wallet'],
        appearance: {
          accentColor: '#0c7d75',
          landingHeader: "Access Ma'at",
          loginMessage: 'Manage and settle verified supplier invoices.',
          showWalletLoginFirst: false,
          walletChainType: 'ethereum-only',
          walletList: [
            'detected_wallets',
            'metamask',
            'coinbase_wallet',
            'rainbow',
            'wallet_connect',
          ],
        },
        supportedChains: [creditCoin3Testnet, sepolia],
        defaultChain: creditCoin3Testnet,
        embeddedWallets: {
          ethereum: { createOnLogin: 'users-without-wallets' },
        },
      }}
    >
      <WagmiProvider config={wagmiConfig}>{children}</WagmiProvider>
    </PrivyProvider>
  )
}
