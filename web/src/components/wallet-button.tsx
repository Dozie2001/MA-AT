import { usePrivy } from '@privy-io/react-auth'
import {
  Check,
  ChevronDown,
  LogOut,
  Mail,
  Wallet,
  WalletCards,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { useConnection, useSwitchChain } from 'wagmi'

import { truncateAddress } from '../lib/format'

export function WalletButton() {
  const [isOpen, setIsOpen] = useState(false)
  const connection = useConnection()
  const switchChain = useSwitchChain()
  const { authenticated, connectOrCreateWallet, login, logout, ready, user } =
    usePrivy()

  const isConnected = authenticated && connection.status === 'connected'
  const isLoading = !ready || connection.status === 'connecting'
  const email = user?.email?.address

  function openWallet() {
    if (!ready) return
    if (!authenticated) {
      login()
      return
    }
    setIsOpen(true)
  }

  async function signOut() {
    await logout()
    setIsOpen(false)
  }

  return (
    <>
      <button
        className={isConnected ? 'wallet-trigger connected' : 'wallet-trigger'}
        type="button"
        onClick={openWallet}
        aria-haspopup={authenticated ? 'dialog' : undefined}
      >
        {isConnected ? (
          <ConnectorIcon
            icon={connection.connector.icon}
            name={connection.connector.name}
            compact
          />
        ) : email ? (
          <Mail size={16} />
        ) : (
          <Wallet size={16} />
        )}
        <span>
          {isLoading
            ? 'Loading wallet...'
            : connection.address
              ? truncateAddress(connection.address)
              : (email ?? 'Log in or connect')}
        </span>
        <ChevronDown size={14} />
      </button>

      {isOpen ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => setIsOpen(false)}
        >
          <section
            className="wallet-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="wallet-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="dialog-head">
              <div>
                <span className="eyebrow">MA'AT ACCOUNT</span>
                <h2 id="wallet-title">
                  {isConnected ? 'Wallet connected' : 'Finish wallet setup'}
                </h2>
              </div>
              <button
                className="icon-button"
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            {isConnected ? (
              <div className="wallet-connected-panel">
                <ConnectorIcon
                  icon={connection.connector.icon}
                  name={connection.connector.name}
                />
                <div>
                  <strong>{truncateAddress(connection.address, 6)}</strong>
                  <span>
                    {connection.connector.name} ·{' '}
                    {connection.chain?.name ?? `Chain ${connection.chainId}`}
                  </span>
                  {email ? <small>{email}</small> : null}
                </div>
                <Check className="success-icon" size={20} />
              </div>
            ) : (
              <div className="wallet-connected-panel">
                <WalletCards size={22} />
                <div>
                  <strong>No active EVM wallet</strong>
                  <span>Connect or create a wallet to continue.</span>
                </div>
              </div>
            )}

            <div className="dialog-actions">
              {isConnected ? (
                <div className="chain-switch-row">
                  {switchChain.chains.map((chain) => (
                    <button
                      className={
                        connection.chainId === chain.id ? 'active' : ''
                      }
                      type="button"
                      key={chain.id}
                      onClick={() => switchChain.mutate({ chainId: chain.id })}
                      disabled={switchChain.isPending}
                    >
                      {chain.name}
                    </button>
                  ))}
                </div>
              ) : (
                <button
                  className="button-primary"
                  type="button"
                  onClick={connectOrCreateWallet}
                >
                  Connect or create wallet
                </button>
              )}
              <button
                className="text-button danger-text"
                type="button"
                onClick={signOut}
              >
                <LogOut size={16} /> Log out
              </button>
            </div>
            <p className="dialog-footnote">
              Ma'at never requests or stores private keys. Privy secures email
              access and wallet connections; every transaction still requires
              authorization.
            </p>
          </section>
        </div>
      ) : null}
    </>
  )
}

function ConnectorIcon({
  icon,
  name,
  compact = false,
}: {
  icon?: string
  name: string
  compact?: boolean
}) {
  if (icon) {
    return (
      <img
        className={compact ? 'connector-icon compact' : 'connector-icon'}
        src={icon}
        alt={`${name} logo`}
      />
    )
  }

  return compact ? (
    <span className="connector-fallback compact" aria-hidden="true">
      {name.slice(0, 1).toUpperCase()}
    </span>
  ) : (
    <span className="connector-fallback" aria-hidden="true">
      {name.slice(0, 2).toUpperCase()}
    </span>
  )
}
