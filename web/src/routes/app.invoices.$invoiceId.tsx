import { Link, createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft,
  BadgeCheck,
  Clock3,
  Download,
  ExternalLink,
  RefreshCw,
  ShieldAlert,
  Wallet,
} from 'lucide-react'
import { useEffect } from 'react'
import { isHex } from 'viem'
import {
  useConnection,
  useReadContract,
  useReadContracts,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi'

import { InvoiceShareActions } from '../components/invoice-share-actions'
import { StatusPill } from '../components/status-pill'
import { getAttestcoinProofReceipt } from '../lib/attestcoin-proof'
import {
  contracts,
  creditPolicyAbi,
  erc20Abi,
  invoiceRegistryAbi,
  invoiceStatuses,
  settlementDeployments,
  settlementRouterAbi,
  trustRegistryAbi,
  trustTiers,
  usdcIconUrl,
} from '../lib/contracts'
import {
  errorMessage,
  explorerAddress,
  explorerTransaction,
  formatTimestamp,
  formatUsdc,
  truncateAddress,
} from '../lib/format'
import { creditCoin3Testnet, sepolia } from '../lib/web3'
import { getInvoicePaymentHistory } from '../lib/payment-history'
import { aggregatePayerMetrics } from '../lib/trust-metrics'

export const Route = createFileRoute('/app/invoices/$invoiceId')({
  component: InvoiceDetail,
})

function InvoiceDetail() {
  const { invoiceId: invoiceIdParam } = Route.useParams()
  const invoiceId =
    isHex(invoiceIdParam, { strict: true }) && invoiceIdParam.length === 66
      ? invoiceIdParam
      : undefined
  const connection = useConnection()
  const switchChain = useSwitchChain()
  const approve = useWriteContract()
  const resetApproval = useWriteContract()
  const pay = useWriteContract()
  const cancel = useWriteContract()

  const invoiceQuery = useReadContracts({
    allowFailure: false,
    contracts: invoiceId
      ? settlementDeployments.map((deployment) => ({
          address: deployment.invoiceRegistry,
          abi: invoiceRegistryAbi,
          functionName: 'getInvoice' as const,
          args: [invoiceId] as const,
          chainId: creditCoin3Testnet.id,
        }))
      : [],
    query: { enabled: Boolean(invoiceId), refetchInterval: 15_000 },
  })
  const invoiceDeploymentIndex = invoiceQuery.data?.findIndex(
    (candidate) => candidate.status !== 0,
  )
  const invoiceDeployment =
    invoiceDeploymentIndex !== undefined && invoiceDeploymentIndex >= 0
      ? settlementDeployments[invoiceDeploymentIndex]
      : undefined
  const invoice =
    invoiceDeploymentIndex !== undefined && invoiceDeploymentIndex >= 0
      ? invoiceQuery.data?.[invoiceDeploymentIndex]
      : undefined
  const isExistingInvoice = Boolean(invoice && invoice.status !== 0)
  const isWritableInvoice = invoiceDeployment?.writable === true
  const isOpen = invoice?.status === 1
  const isBuyer = Boolean(
    invoice && connection.address && invoice.buyer === connection.address,
  )
  const isVendor = Boolean(
    invoice && connection.address && invoice.vendor === connection.address,
  )

  const sourcePayments = useQuery({
    queryKey: ['invoice-payment-history', invoiceId],
    queryFn: () =>
      getInvoicePaymentHistory({ data: { invoiceId: invoiceId! } }),
    enabled: Boolean(invoiceId),
    refetchInterval: isOpen ? 15_000 : false,
  })
  const matchingPayment = sourcePayments.data?.find(
    (log) =>
      invoice &&
      log.payer === invoice.buyer &&
      log.vendor === invoice.vendor &&
      BigInt(log.amount) === invoice.amount,
  )

  const proofReceipt = useQuery({
    queryKey: ['attestcoin-proof-receipt', matchingPayment?.transactionHash],
    queryFn: () =>
      getAttestcoinProofReceipt({
        data: { transactionHash: matchingPayment!.transactionHash },
      }),
    enabled: Boolean(matchingPayment?.transactionHash),
    refetchInterval: isOpen ? 15_000 : false,
  })

  const allowance = useReadContract({
    address: contracts.sepoliaUsdc,
    abi: erc20Abi,
    functionName: 'allowance',
    args:
      connection.address && isBuyer
        ? [connection.address, contracts.settlementRouter]
        : undefined,
    chainId: sepolia.id,
    query: {
      enabled: Boolean(
        connection.address && isBuyer && isOpen && isWritableInvoice,
      ),
    },
  })
  const balance = useReadContract({
    address: contracts.sepoliaUsdc,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: connection.address && isBuyer ? [connection.address] : undefined,
    chainId: sepolia.id,
    query: {
      enabled: Boolean(
        connection.address && isBuyer && isOpen && isWritableInvoice,
      ),
    },
  })

  const payerTrust = useReadContracts({
    allowFailure: false,
    contracts: invoice
      ? [
          {
            address: settlementDeployments[0].trustRegistry,
            abi: trustRegistryAbi,
            functionName: 'getPayerMetrics',
            args: [invoice.buyer],
            chainId: creditCoin3Testnet.id,
          },
          {
            address: settlementDeployments[1].trustRegistry,
            abi: trustRegistryAbi,
            functionName: 'getPayerMetrics',
            args: [invoice.buyer],
            chainId: creditCoin3Testnet.id,
          },
          {
            address: contracts.creditPolicy,
            abi: creditPolicyAbi,
            functionName: 'creditLimitUsdc',
            args: [invoice.buyer],
            chainId: creditCoin3Testnet.id,
          },
        ]
      : [],
    query: { enabled: Boolean(isExistingInvoice), refetchInterval: 15_000 },
  })

  const approvalReceipt = useWaitForTransactionReceipt({
    chainId: sepolia.id,
    hash: approve.data,
    query: { enabled: Boolean(approve.data) },
  })
  const resetReceipt = useWaitForTransactionReceipt({
    chainId: sepolia.id,
    hash: resetApproval.data,
    query: { enabled: Boolean(resetApproval.data) },
  })
  const paymentReceipt = useWaitForTransactionReceipt({
    chainId: sepolia.id,
    hash: pay.data,
    query: { enabled: Boolean(pay.data) },
  })
  const cancellationReceipt = useWaitForTransactionReceipt({
    chainId: creditCoin3Testnet.id,
    hash: cancel.data,
    query: { enabled: Boolean(cancel.data) },
  })

  useEffect(() => {
    if (approvalReceipt.isSuccess || resetReceipt.isSuccess)
      void allowance.refetch()
  }, [allowance, approvalReceipt.isSuccess, resetReceipt.isSuccess])

  useEffect(() => {
    if (paymentReceipt.isSuccess) void sourcePayments.refetch()
  }, [paymentReceipt.isSuccess, sourcePayments])

  useEffect(() => {
    if (cancellationReceipt.isSuccess) void invoiceQuery.refetch()
  }, [cancellationReceipt.isSuccess, invoiceQuery])

  async function ensureSepolia() {
    if (connection.chainId !== sepolia.id) {
      await switchChain.switchChainAsync({ chainId: sepolia.id })
    }
  }

  async function resetUsdcAllowance() {
    if (!isWritableInvoice) return
    try {
      await ensureSepolia()
      resetApproval.writeContract({
        address: contracts.sepoliaUsdc,
        abi: erc20Abi,
        functionName: 'approve',
        args: [contracts.settlementRouter, 0n],
        chainId: sepolia.id,
      })
    } catch {
      return
    }
  }

  async function approveUsdc() {
    if (!invoice || !isWritableInvoice) return
    try {
      await ensureSepolia()
      approve.writeContract({
        address: contracts.sepoliaUsdc,
        abi: erc20Abi,
        functionName: 'approve',
        args: [contracts.settlementRouter, invoice.amount],
        chainId: sepolia.id,
      })
    } catch {
      return
    }
  }

  async function payInvoice() {
    if (!invoice || !invoiceId || matchingPayment || !isWritableInvoice) return
    try {
      await ensureSepolia()
      pay.writeContract({
        address: contracts.settlementRouter,
        abi: settlementRouterAbi,
        functionName: 'payInvoice',
        args: [invoiceId, invoice.vendor, invoice.amount],
        chainId: sepolia.id,
      })
    } catch {
      return
    }
  }

  async function cancelInvoice() {
    if (!invoiceId || !invoiceDeployment || !isWritableInvoice) return
    try {
      if (connection.chainId !== creditCoin3Testnet.id) {
        await switchChain.switchChainAsync({ chainId: creditCoin3Testnet.id })
      }
      cancel.writeContract({
        address: invoiceDeployment.invoiceRegistry,
        abi: invoiceRegistryAbi,
        functionName: 'cancelInvoice',
        args: [invoiceId],
        chainId: creditCoin3Testnet.id,
      })
    } catch {
      return
    }
  }

  function downloadProofReceipt() {
    if (
      !invoice ||
      !invoiceDeployment ||
      !matchingPayment ||
      !proofReceipt.data?.available
    )
      return

    const receipt = {
      schema: 'maat.attestcoin-proof-receipt.v1',
      invoice: {
        id: invoiceId,
        vendor: invoice.vendor,
        buyer: invoice.buyer,
        amountUsdcBaseUnits: invoice.amount.toString(),
        dueAt: invoice.dueAt.toString(),
        settledAt: invoice.settledAt.toString(),
        status: invoiceStatuses[invoice.status],
      },
      sourcePayment: matchingPayment,
      attestcoinProof: proofReceipt.data,
      creditcoin: {
        chainId: creditCoin3Testnet.id,
        invoiceRegistry: invoiceDeployment.invoiceRegistry,
        settlementVerifier: invoiceDeployment.settlementVerifier,
        deployment: invoiceDeployment.key,
        settled: invoice.status === 2,
      },
    }
    const blobUrl = URL.createObjectURL(
      new Blob([JSON.stringify(receipt, null, 2)], {
        type: 'application/json',
      }),
    )
    const link = document.createElement('a')
    link.href = blobUrl
    link.download = `maat-proof-${invoiceId.slice(2, 10)}.json`
    link.click()
    URL.revokeObjectURL(blobUrl)
  }

  if (!invoiceId) {
    return (
      <InvalidInvoice message="The route does not contain a valid 32-byte invoice ID." />
    )
  }

  if (invoiceQuery.isPending) {
    return (
      <div className="panel">
        <div className="loading-line" />
        <div className="loading-line" />
        <div className="loading-line" />
      </div>
    )
  }

  if (invoiceQuery.error) {
    return (
      <InvalidInvoice
        message={`Creditcoin read failed: ${errorMessage(invoiceQuery.error)}`}
      />
    )
  }

  if (!invoice || !invoiceDeployment || invoice.status === 0) {
    return (
      <InvalidInvoice message="No invoice exists for this ID in the current or legacy Creditcoin InvoiceRegistry." />
    )
  }

  const status = invoiceStatuses[invoice.status]
  const metrics = payerTrust.data
    ? aggregatePayerMetrics([payerTrust.data[0], payerTrust.data[1]])
    : undefined
  const creditLimit = payerTrust.data?.[2] ?? 0n
  const hasBalance =
    balance.data !== undefined && balance.data >= invoice.amount
  const currentAllowance = allowance.data ?? 0n
  const needsReset = currentAllowance > 0n && currentAllowance < invoice.amount
  const approved = currentAllowance >= invoice.amount
  const paymentPending = pay.isPending || paymentReceipt.isLoading
  const alreadyPaid = Boolean(matchingPayment || paymentReceipt.isSuccess)
  const proofAvailable = proofReceipt.data?.available === true
  const proofAccepted = proofAvailable || invoice.status === 2

  return (
    <>
      <div className="page-heading page-heading-row">
        <div>
          <Link className="back-link" to="/app">
            <ArrowLeft size={14} /> Overview
          </Link>
          <span className="eyebrow">INVOICE RECORD</span>
          <h1 className="token-heading">
            <img src={usdcIconUrl} alt="USDC" /> {formatUsdc(invoice.amount)}{' '}
            USDC
          </h1>
          <InvoiceShareActions invoiceId={invoiceId} />
        </div>
        <StatusPill
          tone={
            invoice.status === 2
              ? 'success'
              : invoice.status === 3
                ? 'danger'
                : alreadyPaid
                  ? 'warning'
                  : 'teal'
          }
        >
          {invoice.status === 1 && alreadyPaid
            ? 'Awaiting attestation'
            : status}
        </StatusPill>
      </div>

      <div className="detail-layout">
        <div>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">CREDITCOIN TERMS</span>
                <h2>Invoice details</h2>
                <p>Read directly from InvoiceRegistry on chain 102031.</p>
              </div>
              <a
                className="icon-button"
                href={explorerAddress(
                  creditCoin3Testnet.blockExplorers.default.url,
                  invoiceDeployment.invoiceRegistry,
                )}
                target="_blank"
                rel="noreferrer"
                aria-label="Open registry on explorer"
              >
                <ExternalLink size={16} />
              </a>
            </div>
            <dl className="detail-grid">
              <div>
                <dt>Vendor</dt>
                <dd>
                  <a
                    href={explorerAddress(
                      creditCoin3Testnet.blockExplorers.default.url,
                      invoice.vendor,
                    )}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {truncateAddress(invoice.vendor, 7)} ↗
                  </a>
                </dd>
              </div>
              <div>
                <dt>Buyer</dt>
                <dd>
                  <a
                    href={explorerAddress(
                      creditCoin3Testnet.blockExplorers.default.url,
                      invoice.buyer,
                    )}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {truncateAddress(invoice.buyer, 7)} ↗
                  </a>
                </dd>
              </div>
              <div>
                <dt>Issued</dt>
                <dd>{formatTimestamp(invoice.issuedAt)}</dd>
              </div>
              <div>
                <dt>Due</dt>
                <dd>{formatTimestamp(invoice.dueAt)}</dd>
              </div>
              <div>
                <dt>Settled</dt>
                <dd>{formatTimestamp(invoice.settledAt)}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{status}</dd>
              </div>
              <div className="wide">
                <dt>Metadata commitment</dt>
                <dd className="mono">{invoice.metadataHash}</dd>
              </div>
            </dl>
            {!isWritableInvoice ? (
              <div className="inline-notice">
                This record belongs to {invoiceDeployment.label}. It remains
                verifiable on-chain, but new payment and cancellation actions
                use the active Batch v2 deployment only.
              </div>
            ) : null}
          </section>

          <section className="panel panel-spaced">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">CROSS-CHAIN STATE</span>
                <h2>Verification timeline</h2>
                <p>
                  Sepolia payment evidence is detected independently from
                  Creditcoin settlement state.
                </p>
              </div>
            </div>
            <div className="proof-stack horizontal-proof" aria-live="polite">
              <div className="proof-step complete">
                <span className="proof-dot">1</span>
                <div className="proof-copy">
                  <strong>Terms committed</strong>
                  <span>Creditcoin InvoiceRegistry</span>
                </div>
              </div>
              <div
                className={`proof-step ${alreadyPaid || invoice.status === 2 ? 'complete' : 'active'}`}
              >
                <span className="proof-dot">2</span>
                <div className="proof-copy">
                  <strong>
                    {alreadyPaid || invoice.status === 2
                      ? 'USDC payment found'
                      : 'Waiting for payment'}
                  </strong>
                  <span>Sepolia SettlementRouter</span>
                  {matchingPayment?.transactionHash ? (
                    <a
                      href={explorerTransaction(
                        sepolia.blockExplorers.default.url,
                        matchingPayment.transactionHash,
                      )}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {truncateAddress(matchingPayment.transactionHash, 7)} ↗
                    </a>
                  ) : null}
                </div>
              </div>
              <div
                className={`proof-step ${proofAccepted ? 'complete' : alreadyPaid ? 'active' : ''}`}
              >
                <span className="proof-dot">3</span>
                <div className="proof-copy">
                  <strong>
                    {invoice.status === 2
                      ? 'Attestcoin proof accepted'
                      : proofAvailable
                        ? 'Attestcoin proof generated'
                        : alreadyPaid
                          ? 'Waiting for attested proof'
                          : 'Attestation follows payment'}
                  </strong>
                  <span>
                    {proofAvailable
                      ? `Height ${proofReceipt.data.headerNumber} · tx index ${proofReceipt.data.txIndex}`
                      : 'Decentralized source-chain verification'}
                  </span>
                </div>
              </div>
              <div
                className={`proof-step ${invoice.status === 2 ? 'complete' : proofAvailable ? 'active' : ''}`}
              >
                <span className="proof-dot">4</span>
                <div className="proof-copy">
                  <strong>
                    {invoice.status === 2
                      ? 'Invoice and trust updated'
                      : proofAvailable
                        ? 'Awaiting Creditcoin submission'
                        : 'Settlement follows verification'}
                  </strong>
                  <span>Atomic Creditcoin business logic</span>
                </div>
              </div>
            </div>
          </section>

          {matchingPayment ? (
            <section className="panel panel-spaced proof-receipt">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">ATTESTCOIN EVIDENCE</span>
                  <h2>Proof receipt</h2>
                  <p>
                    Verifiable metadata returned for the exact Sepolia payment
                    transaction.
                  </p>
                </div>
                <StatusPill
                  tone={
                    proofReceipt.error
                      ? 'danger'
                      : proofAvailable
                        ? 'success'
                        : 'warning'
                  }
                >
                  {proofReceipt.error
                    ? 'Unavailable'
                    : proofAvailable
                      ? invoice.status === 2
                        ? 'Accepted'
                        : 'Generated'
                      : 'Pending'}
                </StatusPill>
              </div>

              {proofReceipt.isPending ? (
                <div>
                  <div className="loading-line" />
                  <div className="loading-line" />
                </div>
              ) : proofReceipt.error ? (
                <div className="inline-notice danger">
                  Attestcoin receipt lookup failed:{' '}
                  {errorMessage(proofReceipt.error)}
                  <button
                    className="button-ghost"
                    type="button"
                    onClick={() => void proofReceipt.refetch()}
                  >
                    <RefreshCw size={14} /> Retry receipt
                  </button>
                </div>
              ) : proofReceipt.data.available ? (
                <>
                  <div className="receipt-grid">
                    <div>
                      <span>Source chain key</span>
                      <strong>{proofReceipt.data.chainKey} · Sepolia</strong>
                    </div>
                    <div>
                      <span>Attested height</span>
                      <strong>{proofReceipt.data.headerNumber}</strong>
                    </div>
                    <div>
                      <span>Transaction index</span>
                      <strong>{proofReceipt.data.txIndex}</strong>
                    </div>
                    <div>
                      <span>Proof structure</span>
                      <strong>
                        {proofReceipt.data.merkleSiblingCount} siblings ·{' '}
                        {proofReceipt.data.continuityRootCount} roots
                      </strong>
                    </div>
                    <div className="wide">
                      <span>Merkle root</span>
                      <code>{proofReceipt.data.merkleRoot}</code>
                    </div>
                    <div className="wide">
                      <span>Continuity lower endpoint</span>
                      <code>{proofReceipt.data.lowerEndpointDigest}</code>
                    </div>
                  </div>
                  <div className="receipt-actions">
                    <a
                      className="button-secondary"
                      href={explorerTransaction(
                        sepolia.blockExplorers.default.url,
                        matchingPayment.transactionHash,
                      )}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Source transaction <ExternalLink size={14} />
                    </a>
                    <button
                      className="button-ghost"
                      type="button"
                      onClick={downloadProofReceipt}
                    >
                      <Download size={14} /> Download JSON receipt
                    </button>
                  </div>
                </>
              ) : (
                <div className="inline-notice">
                  The payment is final on Sepolia. Ma'at checks every 15 seconds
                  until Attestcoin publishes its proof.
                </div>
              )}
            </section>
          ) : null}

          <section className="panel panel-spaced">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">PAYER RISK</span>
                <h2>Verified trust</h2>
                <p>Only accepted settlements alter these values.</p>
              </div>
              {metrics ? (
                <StatusPill tone={metrics.tier === 4 ? 'danger' : 'teal'}>
                  {trustTiers[metrics.tier]}
                </StatusPill>
              ) : null}
            </div>
            {payerTrust.isPending ? (
              <div className="loading-line" />
            ) : metrics ? (
              <>
                <div className="metric-grid">
                  <div className="metric-card">
                    <span>Settlements</span>
                    <strong>{metrics.settledInvoiceCount.toString()}</strong>
                    <small>
                      {metrics.onTimeSettlementCount.toString()} on time ·
                      lifetime
                    </small>
                  </div>
                  <div className="metric-card">
                    <span>Paid volume</span>
                    <strong>${formatUsdc(metrics.totalPaidUsdc)}</strong>
                    <small>Verified USDC · all deployments</small>
                  </div>
                  <div className="metric-card">
                    <span>Credit limit</span>
                    <strong>${formatUsdc(creditLimit)}</strong>
                    <small>Active v2 policy output</small>
                  </div>
                </div>
                <div className="inline-notice">
                  Lifetime trust combines verified v1 and v2 settlements.
                </div>
              </>
            ) : (
              <div className="inline-notice">
                Trust state is currently unavailable.
              </div>
            )}
          </section>
        </div>

        <aside>
          <section className="panel sticky-panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">AVAILABLE ACTION</span>
                <h2>
                  {invoice.status === 2
                    ? 'Settlement complete'
                    : !isWritableInvoice
                      ? 'Historical record'
                    : isBuyer
                      ? 'Pay invoice'
                      : isVendor
                        ? 'Vendor controls'
                        : 'Read-only view'}
                </h2>
              </div>
            </div>

            {!connection.address ? (
              <div className="network-callout">
                <Wallet size={20} />
                <div>
                  <strong>Connect the buyer or vendor wallet</strong>
                  <span>Actions appear only for the matching address.</span>
                </div>
              </div>
            ) : null}

            {invoice.status === 2 ? (
              <div className="completion-card">
                <BadgeCheck size={32} />
                <strong>Attestcoin verified</strong>
                <p>
                  The source payment settled this invoice and updated payer
                  trust on Creditcoin.
                </p>
              </div>
            ) : null}

            {isOpen && isBuyer && isWritableInvoice ? (
              <div className="action-stack">
                <div className="network-callout">
                  <img className="token-icon" src={usdcIconUrl} alt="USDC" />
                  <div>
                    <strong>Ethereum Sepolia</strong>
                    <span>
                      Official USDC · exact {formatUsdc(invoice.amount)}{' '}
                      approval
                    </span>
                  </div>
                </div>
                {sourcePayments.isPending ? (
                  <div className="inline-notice">
                    Checking Sepolia for an existing payment...
                  </div>
                ) : null}
                {sourcePayments.error ? (
                  <div className="inline-notice danger">
                    Payment-history check failed. Payment is disabled to prevent
                    a duplicate.
                  </div>
                ) : null}
                {alreadyPaid ? (
                  <div className="inline-notice">
                    <Clock3 size={15} /> Payment is confirmed on Sepolia. The
                    proof worker must now submit Attestcoin evidence to
                    Creditcoin.
                  </div>
                ) : null}
                {!alreadyPaid && balance.data !== undefined && !hasBalance ? (
                  <div className="inline-notice danger">
                    Insufficient balance. Wallet has {formatUsdc(balance.data)}{' '}
                    USDC and needs {formatUsdc(invoice.amount)} USDC.
                  </div>
                ) : null}
                {!alreadyPaid && needsReset ? (
                  <button
                    className="button-secondary"
                    type="button"
                    onClick={resetUsdcAllowance}
                    disabled={resetApproval.isPending || resetReceipt.isLoading}
                  >
                    {resetApproval.isPending || resetReceipt.isLoading
                      ? 'Resetting allowance...'
                      : '1. Reset existing allowance'}
                  </button>
                ) : null}
                {!alreadyPaid && !needsReset && !approved ? (
                  <button
                    className="button-secondary"
                    type="button"
                    onClick={approveUsdc}
                    disabled={
                      approve.isPending ||
                      approvalReceipt.isLoading ||
                      sourcePayments.isPending ||
                      Boolean(sourcePayments.error)
                    }
                  >
                    {approve.isPending || approvalReceipt.isLoading
                      ? 'Confirming approval...'
                      : '1. Approve exact USDC amount'}
                  </button>
                ) : null}
                {!alreadyPaid && approved ? (
                  <button
                    className="button-primary"
                    type="button"
                    onClick={payInvoice}
                    disabled={
                      !hasBalance ||
                      paymentPending ||
                      sourcePayments.isPending ||
                      Boolean(sourcePayments.error)
                    }
                  >
                    {paymentPending
                      ? 'Confirming payment...'
                      : '2. Pay vendor directly'}
                  </button>
                ) : null}
                <p className="field-note">
                  Approval and payment are separate transactions. Ma'at waits
                  for each receipt and never handles your private key.
                </p>
              </div>
            ) : null}

            {isOpen && isVendor && !alreadyPaid && isWritableInvoice ? (
              <div className="action-stack">
                <div className="inline-notice">
                  Only the vendor can cancel an open invoice. Cancellation
                  prevents later Attestcoin settlement.
                </div>
                <button
                  className="button-ghost danger-text"
                  type="button"
                  onClick={cancelInvoice}
                  disabled={cancel.isPending || cancellationReceipt.isLoading}
                >
                  {cancel.isPending || cancellationReceipt.isLoading
                    ? 'Confirming cancellation...'
                    : 'Cancel open invoice'}
                </button>
              </div>
            ) : null}

            {isOpen &&
            connection.address &&
            !isBuyer &&
            !isVendor &&
            isWritableInvoice ? (
              <div className="inline-notice">
                The connected wallet is neither the recorded buyer nor vendor,
                so this invoice is read-only.
              </div>
            ) : null}

            {[
              approve.error,
              resetApproval.error,
              pay.error,
              cancel.error,
              approvalReceipt.error,
              resetReceipt.error,
              paymentReceipt.error,
              cancellationReceipt.error,
            ].find(Boolean) ? (
              <div className="inline-notice danger action-error">
                {errorMessage(
                  [
                    approve.error,
                    resetApproval.error,
                    pay.error,
                    cancel.error,
                    approvalReceipt.error,
                    resetReceipt.error,
                    paymentReceipt.error,
                    cancellationReceipt.error,
                  ].find(Boolean),
                )}
              </div>
            ) : null}

            {pay.data ? (
              <a
                className="button-ghost tx-link-button"
                href={explorerTransaction(
                  sepolia.blockExplorers.default.url,
                  pay.data,
                )}
                target="_blank"
                rel="noreferrer"
              >
                Payment transaction <ExternalLink size={14} />
              </a>
            ) : null}
          </section>

          {isOpen && alreadyPaid ? (
            <section className="panel panel-spaced warning-panel">
              <ShieldAlert size={21} />
              <h3>Do not pay again</h3>
              <p>
                A matching router payment already exists. Creditcoin remains
                open until the Attestcoin proof transaction is accepted.
              </p>
            </section>
          ) : null}
        </aside>
      </div>
    </>
  )
}

function InvalidInvoice({ message }: { message: string }) {
  return (
    <section className="panel">
      <div className="empty-state">
        <div>
          <ShieldAlert size={32} />
          <strong>Invoice unavailable</strong>
          <span>{message}</span>
          <Link className="button-secondary invalid-back" to="/app">
            Return to overview
          </Link>
        </div>
      </div>
    </section>
  )
}
