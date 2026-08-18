import {
  ClientOnly,
  Link,
  createFileRoute,
  useNavigate,
} from '@tanstack/react-router'
import { ArrowRight, FilePlus2, Search, ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { isHex } from 'viem'
import type { Hex } from 'viem'
import { useConnection, useReadContracts } from 'wagmi'

import { StatusPill } from '../components/status-pill'
import {
  contracts,
  creditPolicyAbi,
  demoEvidence,
  trustRegistryAbi,
  trustTiers,
} from '../lib/contracts'
import { formatTimestamp, formatUsdc, truncateAddress } from '../lib/format'
import { getSavedInvoices } from '../lib/invoice-storage'
import type { SavedInvoice } from '../lib/invoice-storage'
import { creditCoin3Testnet } from '../lib/web3'

export const Route = createFileRoute('/app/')({ component: Dashboard })

function parseInvoiceLocator(value: string): Hex | undefined {
  let candidate = value.trim()

  try {
    const url = new URL(candidate)
    const match = url.pathname.match(/\/app\/invoices\/(0x[0-9a-fA-F]{64})\/?$/)
    if (match) candidate = match[1]
  } catch {
    // Raw invoice IDs are expected to fail URL parsing.
  }

  return isHex(candidate, { strict: true }) && candidate.length === 66
    ? candidate
    : undefined
}

function Dashboard() {
  const connection = useConnection()
  const navigate = useNavigate({ from: '/app/' })
  const [lookup, setLookup] = useState('')
  const [lookupError, setLookupError] = useState<string>()
  const [savedInvoices, setSavedInvoices] = useState<Array<SavedInvoice>>([])
  const address = connection.address

  useEffect(() => setSavedInvoices(getSavedInvoices()), [])

  const trust = useReadContracts({
    allowFailure: false,
    contracts: address
      ? [
          {
            address: contracts.trustRegistry,
            abi: trustRegistryAbi,
            functionName: 'getPayerMetrics',
            args: [address],
            chainId: creditCoin3Testnet.id,
          },
          {
            address: contracts.creditPolicy,
            abi: creditPolicyAbi,
            functionName: 'creditLimitUsdc',
            args: [address],
            chainId: creditCoin3Testnet.id,
          },
        ]
      : [],
    query: { enabled: Boolean(address) },
  })

  const metrics = trust.data?.[0]
  const creditLimit = trust.data?.[1] ?? 0n

  function submitLookup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const invoiceId = parseInvoiceLocator(lookup)

    if (!invoiceId) {
      setLookupError(
        "Enter a 32-byte invoice ID or paste a Ma'at customer invoice link.",
      )
      return
    }

    setLookupError(undefined)
    void navigate({
      to: '/app/invoices/$invoiceId',
      params: { invoiceId },
    })
  }

  return (
    <>
      <div className="page-heading page-heading-row">
        <div>
          <span className="eyebrow">SETTLEMENT CONTROL PLANE</span>
          <h1>Financial truth, on-chain.</h1>
          <p>
            Issue invoices on Creditcoin, settle in Sepolia USDC, and inspect
            the trust produced by verified payment behavior.
          </p>
        </div>
        <Link className="button-primary" to="/app/invoices/new">
          <FilePlus2 size={16} /> New invoice
        </Link>
      </div>

      <div className="dashboard-grid">
        <div className="dashboard-primary">
          <section className="panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">CONNECTED PAYER</span>
                <h2>Trust position</h2>
                <p>
                  Read directly from MaatTrustRegistry and MaatCreditPolicy.
                </p>
              </div>
              {metrics ? (
                <StatusPill tone={metrics.tier === 4 ? 'danger' : 'teal'}>
                  {trustTiers[metrics.tier]}
                </StatusPill>
              ) : null}
            </div>
            {!address ? (
              <div className="empty-state">
                <div>
                  <ShieldCheck size={30} />
                  <strong>Connect a wallet to read trust</strong>
                  <span>
                    Your payer metrics and credit limit are public Creditcoin
                    state.
                  </span>
                </div>
              </div>
            ) : trust.isPending ? (
              <div>
                <div className="loading-line" />
                <div className="loading-line" />
                <div className="loading-line" />
              </div>
            ) : trust.error ? (
              <div className="inline-notice danger">
                Could not read Creditcoin trust state:{' '}
                {trust.error.message.split('\n')[0]}
              </div>
            ) : metrics ? (
              <div className="metric-grid">
                <div className="metric-card">
                  <span>Verified invoices</span>
                  <strong>{metrics.settledInvoiceCount.toString()}</strong>
                  <small>
                    {metrics.onTimeSettlementCount.toString()} paid on time
                  </small>
                </div>
                <div className="metric-card">
                  <span>Verified volume</span>
                  <strong>${formatUsdc(metrics.totalPaidUsdc)}</strong>
                  <small>Sepolia USDC</small>
                </div>
                <div className="metric-card">
                  <span>Credit policy limit</span>
                  <strong>${formatUsdc(creditLimit)}</strong>
                  <small>{trustTiers[metrics.tier]} terms</small>
                </div>
              </div>
            ) : null}
          </section>

          <section className="panel panel-spaced">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">INVOICE LOOKUP</span>
                <h2>Inspect exact state</h2>
                <p>
                  Enter a bytes32 invoice ID or paste a customer link. This
                  reads InvoiceRegistry directly.
                </p>
              </div>
            </div>
            <form className="lookup-form" onSubmit={submitLookup}>
              <div className="lookup-field">
                <label htmlFor="invoice-lookup">
                  Invoice ID or customer link
                </label>
                <input
                  id="invoice-lookup"
                  placeholder="0x... or https://.../app/invoices/0x..."
                  value={lookup}
                  aria-invalid={Boolean(lookupError)}
                  aria-describedby={
                    lookupError ? 'invoice-lookup-error' : undefined
                  }
                  onChange={(event) => {
                    setLookup(event.target.value)
                    setLookupError(undefined)
                  }}
                />
                {lookupError ? (
                  <span className="field-error" id="invoice-lookup-error">
                    {lookupError}
                  </span>
                ) : null}
              </div>
              <button
                className="button-secondary"
                type="submit"
                disabled={!lookup.trim()}
              >
                <Search size={15} /> Look up
              </button>
            </form>
          </section>

          <section className="panel panel-spaced">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">SAVED IN THIS BROWSER</span>
                <h2>Recent invoices</h2>
                <p>
                  This is local convenience history, not an on-chain indexer.
                </p>
              </div>
            </div>
            <ClientOnly fallback={<div className="loading-line" />}>
              {savedInvoices.length ? (
                <div className="invoice-list">
                  {savedInvoices.map((invoice) => (
                    <Link
                      className="invoice-card"
                      key={invoice.invoiceId}
                      to="/app/invoices/$invoiceId"
                      params={{ invoiceId: invoice.invoiceId }}
                    >
                      <div className="invoice-card-head">
                        <h3>{truncateAddress(invoice.invoiceId, 10)}</h3>
                        <StatusPill tone="warning">Open</StatusPill>
                      </div>
                      <dl>
                        <div>
                          <dt>Amount</dt>
                          <dd>{invoice.amount} USDC</dd>
                        </div>
                        <div>
                          <dt>Buyer</dt>
                          <dd>{truncateAddress(invoice.buyer)}</dd>
                        </div>
                        <div>
                          <dt>Due</dt>
                          <dd>{formatTimestamp(BigInt(invoice.dueAt))}</dd>
                        </div>
                      </dl>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <div>
                    <FilePlus2 size={30} />
                    <strong>No locally saved invoices</strong>
                    <span>
                      Create one from this browser or inspect the verified demo.
                    </span>
                  </div>
                </div>
              )}
            </ClientOnly>
          </section>
        </div>

        <aside className="dashboard-aside">
          <section className="panel sticky-panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">LIVE END-TO-END PROOF</span>
                <h2>One USDC, verified.</h2>
              </div>
              <StatusPill tone="success">Settled</StatusPill>
            </div>
            <div className="proof-stack">
              <ProofStep
                number="1"
                title="Invoice created"
                detail="Creditcoin Testnet"
                hash={demoEvidence.createTx}
                href={`https://creditcoin-testnet.blockscout.com/tx/${demoEvidence.createTx}`}
              />
              <ProofStep
                number="2"
                title="Vendor paid"
                detail="Ethereum Sepolia"
                hash={demoEvidence.paymentTx}
                href={`https://sepolia.etherscan.io/tx/${demoEvidence.paymentTx}`}
              />
              <ProofStep
                number="3"
                title="Attestcoin accepted"
                detail="Invoice + trust updated atomically"
                hash={demoEvidence.settlementTx}
                href={`https://creditcoin-testnet.blockscout.com/tx/${demoEvidence.settlementTx}`}
              />
            </div>
            <Link
              className="button-ghost proof-button"
              to="/app/invoices/$invoiceId"
              params={{ invoiceId: demoEvidence.invoiceId }}
            >
              Inspect invoice <ArrowRight size={15} />
            </Link>
          </section>
        </aside>
      </div>
    </>
  )
}

function ProofStep({
  number,
  title,
  detail,
  hash,
  href,
}: {
  number: string
  title: string
  detail: string
  hash: string
  href: string
}) {
  return (
    <div className="proof-step complete">
      <span className="proof-dot">{number}</span>
      <div className="proof-copy">
        <strong>{title}</strong>
        <span>{detail}</span>
        <a href={href} target="_blank" rel="noreferrer">
          {truncateAddress(hash, 7)} ↗
        </a>
      </div>
    </div>
  )
}
