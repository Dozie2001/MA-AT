import { Check, ChevronDown, LogOut, Wallet, X } from 'lucide-react'
import { useState } from 'react'
import { useConnect, useConnection, useDisconnect, useSwitchChain } from 'wagmi'

import { truncateAddress } from '../lib/format'

export function WalletButton() {
  const [isOpen, setIsOpen] = useState(false)
  const connection = useConnection()
  const connect = useConnect()
  const disconnect = useDisconnect()
  const switchChain = useSwitchChain()

  const isConnected = connection.status === 'connected'
  const isConnecting = connection.status === 'connecting' || connect.isPending

  function close() {
    setIsOpen(false)
    connect.reset()
  }

  return (
    <>
      <button
        className={isConnected ? 'wallet-trigger connected' : 'wallet-trigger'}
        type="button"
        onClick={() => setIsOpen(true)}
        aria-haspopup="dialog"
      >
        {isConnected ? (
          <ConnectorIcon
            icon={connection.connector.icon}
            name={connection.connector.name}
            compact
          />
        ) : (
          <Wallet size={16} />
        )}
        <span>
          {isConnecting
            ? 'Connecting...'
            : connection.address
              ? truncateAddress(connection.address)
              : 'Connect wallet'}
        </span>
        <ChevronDown size={14} />
      </button>

      {isOpen ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={close}>
          <section
            className="wallet-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="wallet-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="dialog-head">
              <div>
                <span className="eyebrow">CONNECTION</span>
                <h2 id="wallet-title">
                  {isConnected ? 'Wallet connected' : 'Choose a wallet'}
                </h2>
              </div>
              <button
                className="icon-button"
                type="button"
                onClick={close}
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
                </div>
                <Check className="success-icon" size={20} />
              </div>
            ) : (
              <div className="wallet-options">
                {connect.connectors.map((connector) => (
                  <button
                    type="button"
                    key={connector.uid}
                    onClick={() =>
                      connect.mutate({ connector }, { onSuccess: close })
                    }
                    disabled={connect.isPending}
                  >
                    <ConnectorIcon
                      icon={connector.icon}
                      name={connector.name}
                    />
                    <span>
                      <strong>{connector.name}</strong>
                      <small>Injected browser wallet</small>
                    </span>
                    <span className="arrow">↗</span>
                  </button>
                ))}
                {connect.connectors.length === 0 ? (
                  <div className="inline-notice danger">
                    No EIP-1193 wallet was detected in this browser.
                  </div>
                ) : null}
              </div>
            )}

            {connect.error ? (
              <div className="inline-notice danger">
                {connect.error.message.split('\n')[0]}
              </div>
            ) : null}

            {isConnected ? (
              <div className="dialog-actions">
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
                <button
                  className="text-button danger-text"
                  type="button"
                  onClick={() =>
                    disconnect.mutate(undefined, { onSuccess: close })
                  }
                >
                  <LogOut size={16} /> Disconnect
                </button>
              </div>
            ) : null}
            <p className="dialog-footnote">
              Ma'at never requests or stores private keys. Your wallet signs
              each transaction.
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
