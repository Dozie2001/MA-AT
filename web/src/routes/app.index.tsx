import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import {
  ArrowRight,
  FilePlus2,
  RefreshCw,
  Search,
  ShieldCheck,
} from 'lucide-react'
import { useState } from 'react'
import { isHex } from 'viem'
import type { Address, Hex } from 'viem'
import {
  useConnection,
  useContractEvents,
  useReadContract,
  useReadContracts,
} from 'wagmi'

import { StatusPill } from '../components/status-pill'
import {
  contracts,
  creditPolicyAbi,
  demoEvidence,
  invoiceRegistryAbi,
  invoiceStatuses,
  settlementDeployments,
  trustRegistryAbi,
  trustTiers,
} from '../lib/contracts'
import { formatTimestamp, formatUsdc, truncateAddress } from '../lib/format'
import {
  aggregatePayerMetrics,
  aggregateVendorMetrics,
} from '../lib/trust-metrics'
import { creditCoin3Testnet } from '../lib/web3'

export const Route = createFileRoute('/app/')({ component: Dashboard })

const [currentDeployment, legacyDeployment] = settlementDeployments

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
  const address = connection.address

  const currentVendorInvoiceEvents = useContractEvents({
    address: currentDeployment.invoiceRegistry,
    abi: invoiceRegistryAbi,
    eventName: 'InvoiceCreated',
    args: address ? { vendor: address } : undefined,
    fromBlock: currentDeployment.deploymentBlock,
    chainId: creditCoin3Testnet.id,
    query: { enabled: Boolean(address) },
  })
  const currentBuyerInvoiceEvents = useContractEvents({
    address: currentDeployment.invoiceRegistry,
    abi: invoiceRegistryAbi,
    eventName: 'InvoiceCreated',
    args: address ? { buyer: address } : undefined,
    fromBlock: currentDeployment.deploymentBlock,
    chainId: creditCoin3Testnet.id,
    query: { enabled: Boolean(address) },
  })
  const legacyVendorInvoiceEvents = useContractEvents({
    address: legacyDeployment.invoiceRegistry,
    abi: invoiceRegistryAbi,
    eventName: 'InvoiceCreated',
    args: address ? { vendor: address } : undefined,
    fromBlock: legacyDeployment.deploymentBlock,
    toBlock: currentDeployment.deploymentBlock - 1n,
    chainId: creditCoin3Testnet.id,
    query: { enabled: Boolean(address) },
  })
  const legacyBuyerInvoiceEvents = useContractEvents({
    address: legacyDeployment.invoiceRegistry,
    abi: invoiceRegistryAbi,
    eventName: 'InvoiceCreated',
    args: address ? { buyer: address } : undefined,
    fromBlock: legacyDeployment.deploymentBlock,
    toBlock: currentDeployment.deploymentBlock - 1n,
    chainId: creditCoin3Testnet.id,
    query: { enabled: Boolean(address) },
  })

  const discoveredInvoices = [
    ...(currentVendorInvoiceEvents.data ?? []).flatMap((event) =>
      event.args.invoiceId
        ? [
            {
              invoiceId: event.args.invoiceId,
              role: 'Vendor' as const,
              blockNumber: event.blockNumber,
              deployment: currentDeployment,
            },
          ]
        : [],
    ),
    ...(currentBuyerInvoiceEvents.data ?? []).flatMap((event) =>
      event.args.invoiceId
        ? [
            {
              invoiceId: event.args.invoiceId,
              role: 'Buyer' as const,
              blockNumber: event.blockNumber,
              deployment: currentDeployment,
            },
          ]
        : [],
    ),
    ...(legacyVendorInvoiceEvents.data ?? []).flatMap((event) =>
      event.args.invoiceId
        ? [
            {
              invoiceId: event.args.invoiceId,
              role: 'Vendor' as const,
              blockNumber: event.blockNumber,
              deployment: legacyDeployment,
            },
          ]
        : [],
    ),
    ...(legacyBuyerInvoiceEvents.data ?? []).flatMap((event) =>
      event.args.invoiceId
        ? [
            {
              invoiceId: event.args.invoiceId,
              role: 'Buyer' as const,
              blockNumber: event.blockNumber,
              deployment: legacyDeployment,
            },
          ]
        : [],
    ),
  ]
    .filter(
      (invoice, index, invoices) =>
        invoices.findIndex(
          (candidate) =>
            candidate.invoiceId === invoice.invoiceId &&
            candidate.deployment.key === invoice.deployment.key,
        ) === index,
    )
    .sort((left, right) =>
      left.blockNumber === right.blockNumber
        ? 0
        : left.blockNumber > right.blockNumber
          ? -1
          : 1,
    )

  const invoiceEventQueries = [
    currentVendorInvoiceEvents,
    currentBuyerInvoiceEvents,
    legacyVendorInvoiceEvents,
    legacyBuyerInvoiceEvents,
  ]
  const historyPending = invoiceEventQueries.some((query) => query.isPending)
  const historyFetching = invoiceEventQueries.some((query) => query.isFetching)
  const historyError = invoiceEventQueries.find((query) => query.error)?.error

  const trust = useReadContracts({
    allowFailure: false,
    contracts: address
      ? [
          {
            address: currentDeployment.trustRegistry,
            abi: trustRegistryAbi,
            functionName: 'getPayerMetrics',
            args: [address],
            chainId: creditCoin3Testnet.id,
          },
          {
            address: legacyDeployment.trustRegistry,
            abi: trustRegistryAbi,
            functionName: 'getPayerMetrics',
            args: [address],
            chainId: creditCoin3Testnet.id,
          },
          {
            address: currentDeployment.trustRegistry,
            abi: trustRegistryAbi,
            functionName: 'getVendorMetrics',
            args: [address],
            chainId: creditCoin3Testnet.id,
          },
          {
            address: legacyDeployment.trustRegistry,
            abi: trustRegistryAbi,
            functionName: 'getVendorMetrics',
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

  const metrics = trust.data
    ? aggregatePayerMetrics([trust.data[0], trust.data[1]])
    : undefined
  const vendorMetrics = trust.data
    ? aggregateVendorMetrics([trust.data[2], trust.data[3]])
    : undefined
  const creditLimit = trust.data?.[4] ?? 0n

  function refetchInvoiceHistory() {
    for (const query of invoiceEventQueries) void query.refetch()
  }

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
                <span className="eyebrow">CONNECTED WALLET</span>
                <h2>Settlement position</h2>
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
            ) : metrics && vendorMetrics ? (
              <>
                <div className="metric-grid">
                  <div className="metric-card">
                    <span>Verified paid volume</span>
                    <strong>${formatUsdc(metrics.totalPaidUsdc)}</strong>
                    <small>
                      {metrics.settledInvoiceCount.toString()} invoices ·{' '}
                      {metrics.onTimeSettlementCount.toString()} on time
                    </small>
                  </div>
                  <div className="metric-card">
                    <span>Verified received volume</span>
                    <strong>${formatUsdc(vendorMetrics.totalReceivedUsdc)}</strong>
                    <small>
                      {vendorMetrics.settledInvoiceCount.toString()} invoices ·
                      Sepolia USDC
                    </small>
                  </div>
                  <div className="metric-card">
                    <span>Credit policy limit</span>
                    <strong>${formatUsdc(creditLimit)}</strong>
                    <small>{trustTiers[metrics.tier]} terms</small>
                  </div>
                </div>
                <div className="inline-notice">
                  Lifetime trust combines verified v1 and v2 settlements. The
                  credit-policy limit is the active v2 contract output.
                </div>
              </>
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
                <span className="eyebrow">CREDITCOIN EVENT HISTORY</span>
                <h2>Your invoices</h2>
                <p>
                  Created by or assigned to this wallet, reconstructed directly
                  from current and legacy InvoiceRegistry events.
                </p>
              </div>
              {address ? (
                <button
                  className="icon-button"
                  type="button"
                  onClick={refetchInvoiceHistory}
                  disabled={historyFetching}
                  aria-label="Refresh invoice history"
                >
                  <RefreshCw size={16} />
                </button>
              ) : null}
            </div>
            {!address ? (
              <div className="empty-state">
                <div>
                  <ShieldCheck size={30} />
                  <strong>Connect a wallet to discover invoices</strong>
                  <span>
                    Ma'at queries both vendor and buyer event history for the
                    connected address.
                  </span>
                </div>
              </div>
            ) : historyPending ? (
              <div className="invoice-list" aria-label="Loading invoices">
                <InvoiceCardSkeleton />
                <InvoiceCardSkeleton />
              </div>
            ) : historyError && !discoveredInvoices.length ? (
              <div className="empty-state">
                <div>
                  <ShieldCheck size={30} />
                  <strong>Could not load invoice history</strong>
                  <span>{historyError.message.split('\n')[0]}</span>
                  <button
                    className="button-secondary empty-state-action"
                    type="button"
                    onClick={refetchInvoiceHistory}
                  >
                    Try again
                  </button>
                </div>
              </div>
            ) : discoveredInvoices.length ? (
              <div className="invoice-list">
                {discoveredInvoices.map((invoice) => (
                  <OnchainInvoiceCard
                    key={`${invoice.deployment.key}-${invoice.invoiceId}`}
                    invoiceId={invoice.invoiceId}
                    role={invoice.role}
                    viewer={address}
                    deployment={invoice.deployment}
                  />
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <div>
                  <FilePlus2 size={30} />
                  <strong>No invoices found for this wallet</strong>
                  <span>
                    Create an invoice or ask a vendor to assign this address as
                    the buyer.
                  </span>
                  <Link
                    className="button-secondary empty-state-action"
                    to="/app/invoices/new"
                  >
                    Create invoice
                  </Link>
                </div>
              </div>
            )}
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

function OnchainInvoiceCard({
  invoiceId,
  role,
  viewer,
  deployment,
}: {
  invoiceId: Hex
  role: 'Vendor' | 'Buyer'
  viewer: Address
  deployment: (typeof settlementDeployments)[number]
}) {
  const invoiceQuery = useReadContract({
    address: deployment.invoiceRegistry,
    abi: invoiceRegistryAbi,
    functionName: 'getInvoice',
    args: [invoiceId],
    chainId: creditCoin3Testnet.id,
    query: { refetchInterval: 15_000 },
  })

  if (invoiceQuery.isPending) return <InvoiceCardSkeleton />

  if (invoiceQuery.error) {
    return (
      <div className="invoice-card">
        <div className="invoice-card-head">
          <h3>{truncateAddress(invoiceId, 10)}</h3>
          <StatusPill tone="danger">Read failed</StatusPill>
        </div>
        <button
          className="text-button invoice-card-retry"
          type="button"
          onClick={() => void invoiceQuery.refetch()}
        >
          Retry current state
        </button>
      </div>
    )
  }

  const invoice = invoiceQuery.data
  const status = invoiceStatuses[invoice.status] ?? 'Unknown'
  const counterparty = role === 'Vendor' ? invoice.buyer : invoice.vendor
  const tone =
    invoice.status === 2
      ? 'success'
      : invoice.status === 3
        ? 'danger'
        : 'warning'

  return (
    <Link
      className="invoice-card"
      to="/app/invoices/$invoiceId"
      params={{ invoiceId }}
    >
      <div className="invoice-card-head">
        <div>
          <h3>{truncateAddress(invoiceId, 10)}</h3>
          <span className="invoice-role">
            {role} view · {invoice.vendor === viewer ? 'Issued' : 'Received'} ·{' '}
            {deployment.label}
          </span>
        </div>
        <StatusPill tone={tone}>{status}</StatusPill>
      </div>
      <dl>
        <div>
          <dt>Amount</dt>
          <dd>{formatUsdc(invoice.amount)} USDC</dd>
        </div>
        <div>
          <dt>Counterparty</dt>
          <dd>{truncateAddress(counterparty)}</dd>
        </div>
        <div>
          <dt>Due</dt>
          <dd>{formatTimestamp(invoice.dueAt)}</dd>
        </div>
      </dl>
    </Link>
  )
}

function InvoiceCardSkeleton() {
  return (
    <div className="invoice-card invoice-card-skeleton" aria-hidden="true">
      <div className="loading-line" />
      <div className="loading-line" />
      <div className="loading-line" />
    </div>
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
