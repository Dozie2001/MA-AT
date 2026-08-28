import { usePrivy } from '@privy-io/react-auth'
import { Link, createFileRoute } from '@tanstack/react-router'
import {
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  FilePlus2,
  Mail,
  Network,
  WalletCards,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  decodeEventLog,
  getAddress,
  isAddress,
  keccak256,
  parseUnits,
  stringToHex,
} from 'viem'
import type { Address, Hex } from 'viem'
import {
  useConnection,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi'

import { InvoiceShareActions } from '../components/invoice-share-actions'
import { StatusPill } from '../components/status-pill'
import { contracts, invoiceRegistryAbi, usdcIconUrl } from '../lib/contracts'
import { errorMessage, explorerTransaction } from '../lib/format'
import { prepareInvitedBuyer, sendInvitedBuyerEmail } from '../lib/invitations'
import { creditCoin3Testnet } from '../lib/web3'

export const Route = createFileRoute('/app/invoices/new')({
  component: NewInvoice,
})

interface SubmittedInvoice {
  buyer: Address
  inviteEmail?: string
  amountBaseUnits: bigint
  dueAt: number
  metadataHash: Hex
  vendor: Address
}

type BuyerMode = 'email' | 'wallet'
type InvitationDelivery = 'idle' | 'sending' | 'sent' | 'failed'

function defaultDueDate() {
  const date = new Date(Date.now() + 10 * 60 * 1_000)
  date.setSeconds(0, 0)
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function NewInvoice() {
  const { authenticated, getAccessToken } = usePrivy()
  const connection = useConnection()
  const switchChain = useSwitchChain()
  const write = useWriteContract()
  const [buyerMode, setBuyerMode] = useState<BuyerMode>('email')
  const [buyerEmail, setBuyerEmail] = useState('')
  const [buyer, setBuyer] = useState('')
  const [amount, setAmount] = useState('1.00')
  const [dueAt, setDueAt] = useState(defaultDueDate)
  const [reference, setReference] = useState('')
  const [memo, setMemo] = useState('')
  const [formError, setFormError] = useState<string>()
  const [isPreparingBuyer, setIsPreparingBuyer] = useState(false)
  const [submitted, setSubmitted] = useState<SubmittedInvoice>()
  const [invoiceId, setInvoiceId] = useState<Hex>()
  const [invitationDelivery, setInvitationDelivery] =
    useState<InvitationDelivery>('idle')
  const [invitationError, setInvitationError] = useState<string>()

  const receipt = useWaitForTransactionReceipt({
    chainId: creditCoin3Testnet.id,
    hash: write.data,
    query: { enabled: Boolean(write.data) },
  })

  useEffect(() => {
    if (!receipt.data || !submitted || invoiceId) return

    for (const log of receipt.data.logs) {
      if (getAddress(log.address) !== contracts.invoiceRegistry) continue
      try {
        const decoded = decodeEventLog({
          abi: invoiceRegistryAbi,
          data: log.data,
          topics: log.topics,
          eventName: 'InvoiceCreated',
        })
        if (
          decoded.args.vendor !== submitted.vendor ||
          decoded.args.buyer !== submitted.buyer ||
          decoded.args.amount !== submitted.amountBaseUnits ||
          decoded.args.dueAt !== BigInt(submitted.dueAt) ||
          decoded.args.metadataHash !== submitted.metadataHash
        ) {
          setFormError(
            'Confirmed event does not match the submitted invoice terms.',
          )
          return
        }
        setInvoiceId(decoded.args.invoiceId)
        return
      } catch {
        continue
      }
    }

    setFormError(
      'Transaction confirmed, but its InvoiceCreated event was not found.',
    )
  }, [invoiceId, receipt.data, submitted])

  useEffect(() => {
    if (
      !invoiceId ||
      !submitted?.inviteEmail ||
      invitationDelivery !== 'idle'
    ) {
      return
    }

    setInvitationDelivery('sending')
    setInvitationError(undefined)
    void getAccessToken()
      .then((accessToken) => {
        if (!accessToken)
          throw new Error('Log in again to send the invitation.')
        return sendInvitedBuyerEmail({
          accessToken,
          email: submitted.inviteEmail!,
          invoiceId,
          vendorAddress: submitted.vendor,
        })
      })
      .then(() => setInvitationDelivery('sent'))
      .catch((error: unknown) => {
        setInvitationDelivery('failed')
        setInvitationError(errorMessage(error))
      })
  }, [getAccessToken, invitationDelivery, invoiceId, submitted])

  async function createInvoice(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(undefined)
    write.reset()

    if (!connection.address) {
      setFormError('Connect the vendor wallet before creating an invoice.')
      return
    }
    const vendorAddress = getAddress(connection.address)
    let normalizedBuyer: Address
    let inviteEmail: string | undefined

    if (buyerMode === 'email') {
      if (!authenticated) {
        setFormError('Log in before inviting a buyer by email.')
        return
      }
      if (!buyerEmail.trim()) {
        setFormError('Enter the buyer email address.')
        return
      }

      setIsPreparingBuyer(true)
      try {
        const accessToken = await getAccessToken()
        if (!accessToken)
          throw new Error('Log in again to prepare the buyer wallet.')
        normalizedBuyer = await prepareInvitedBuyer({
          accessToken,
          email: buyerEmail,
          vendorAddress,
        })
        inviteEmail = buyerEmail.trim().toLowerCase()
        setBuyer(normalizedBuyer)
      } catch (error) {
        setFormError(errorMessage(error))
        return
      } finally {
        setIsPreparingBuyer(false)
      }
    } else {
      if (!isAddress(buyer)) {
        setFormError('Enter a valid EVM buyer address.')
        return
      }
      normalizedBuyer = getAddress(buyer)
    }

    if (normalizedBuyer === vendorAddress) {
      setFormError('The buyer must be different from the connected vendor.')
      return
    }

    let amountBaseUnits: bigint
    try {
      amountBaseUnits = parseUnits(amount, 6)
    } catch {
      setFormError('Enter a valid USDC amount with no more than six decimals.')
      return
    }
    if (amountBaseUnits <= 0n || amountBaseUnits > (1n << 128n) - 1n) {
      setFormError('The USDC amount is outside the invoice contract range.')
      return
    }

    const dueTimestamp = Math.floor(new Date(dueAt).getTime() / 1_000)
    if (
      !Number.isSafeInteger(dueTimestamp) ||
      dueTimestamp <= Math.floor(Date.now() / 1_000)
    ) {
      setFormError('Choose a due time in the future.')
      return
    }

    const metadataHash = keccak256(
      stringToHex(
        JSON.stringify({ reference: reference.trim(), memo: memo.trim() }),
      ),
    )
    const terms = {
      buyer: normalizedBuyer,
      inviteEmail,
      amountBaseUnits,
      dueAt: dueTimestamp,
      metadataHash,
      vendor: vendorAddress,
    }
    setSubmitted(terms)
    setInvitationDelivery('idle')
    setInvitationError(undefined)

    try {
      if (connection.chainId !== creditCoin3Testnet.id) {
        await switchChain.switchChainAsync({ chainId: creditCoin3Testnet.id })
      }
      write.writeContract({
        address: contracts.invoiceRegistry,
        abi: invoiceRegistryAbi,
        functionName: 'createInvoice',
        args: [
          normalizedBuyer,
          amountBaseUnits,
          BigInt(dueTimestamp),
          metadataHash,
        ],
        chainId: creditCoin3Testnet.id,
      })
    } catch (error) {
      setFormError(errorMessage(error))
    }
  }

  const pending = isPreparingBuyer || write.isPending || receipt.isLoading

  return (
    <>
      <div className="page-heading page-heading-row">
        <div>
          <Link className="back-link" to="/app">
            <ArrowLeft size={14} /> Overview
          </Link>
          <span className="eyebrow">VENDOR WORKFLOW</span>
          <h1>Issue an invoice.</h1>
          <p>
            Create exact USDC payment terms and share a permanent invoice link
            with your customer.
          </p>
        </div>
        <StatusPill tone="teal">USDC invoice</StatusPill>
      </div>

      <div className="detail-layout">
        <section className="form-card">
          <div className="panel-heading">
            <div>
              <h2>Invoice terms</h2>
              <p>
                All fields below are dynamic. The connected wallet becomes the
                vendor.
              </p>
            </div>
            <FilePlus2 size={22} />
          </div>
          <form onSubmit={createInvoice} noValidate>
            <div className="form-grid">
              <div className="field full">
                <span className="field-label">Buyer identity</span>
                <div className="buyer-mode-switch" role="group">
                  <button
                    className={buyerMode === 'email' ? 'active' : ''}
                    type="button"
                    onClick={() => {
                      setBuyerMode('email')
                      setBuyer('')
                    }}
                  >
                    <Mail size={15} /> Invite by email
                  </button>
                  <button
                    className={buyerMode === 'wallet' ? 'active' : ''}
                    type="button"
                    onClick={() => {
                      setBuyerMode('wallet')
                      setBuyer('')
                    }}
                  >
                    <WalletCards size={15} /> Use wallet address
                  </button>
                </div>
              </div>
              {buyerMode === 'email' ? (
                <div className="field full">
                  <label htmlFor="buyer-email">Buyer email</label>
                  <input
                    id="buyer-email"
                    type="email"
                    autoComplete="email"
                    placeholder="accounts@customer.com"
                    value={buyerEmail}
                    onChange={(event) => {
                      setBuyerEmail(event.target.value)
                      setBuyer('')
                    }}
                    required
                  />
                  <span className="field-note">
                    Ma'at prepares a Privy wallet for this email, binds it to
                    the invoice, and sends access after confirmation.
                  </span>
                  {buyer ? (
                    <span className="resolved-wallet">
                      Prepared wallet · {buyer}
                    </span>
                  ) : null}
                </div>
              ) : (
                <div className="field full">
                  <label htmlFor="buyer">Buyer wallet</label>
                  <input
                    id="buyer"
                    autoComplete="off"
                    spellCheck="false"
                    placeholder="0x..."
                    value={buyer}
                    onChange={(event) => setBuyer(event.target.value)}
                    required
                  />
                  <span className="field-note">
                    Use this when the customer already controls an EVM wallet.
                  </span>
                </div>
              )}
              <div className="field">
                <label className="token-label" htmlFor="amount">
                  Amount{' '}
                  <span>
                    <img src={usdcIconUrl} alt="" /> USDC
                  </span>
                </label>
                <input
                  id="amount"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="due">Due date and time</label>
                <input
                  id="due"
                  type="datetime-local"
                  value={dueAt}
                  onChange={(event) => setDueAt(event.target.value)}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="reference">
                  Reference <span>optional</span>
                </label>
                <input
                  id="reference"
                  type="text"
                  placeholder="INV-2026-001"
                  value={reference}
                  onChange={(event) => setReference(event.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="memo">
                  Memo <span>optional</span>
                </label>
                <textarea
                  id="memo"
                  placeholder="Commercial context committed as a hash"
                  value={memo}
                  onChange={(event) => setMemo(event.target.value)}
                />
              </div>
            </div>

            {formError || write.error || receipt.error ? (
              <div className="inline-notice danger form-notice">
                {formError ?? errorMessage(write.error ?? receipt.error)}
              </div>
            ) : null}

            <div className="form-actions">
              <button
                className="button-primary"
                type="submit"
                disabled={pending || Boolean(invoiceId)}
              >
                {isPreparingBuyer
                  ? 'Preparing buyer wallet...'
                  : pending
                    ? 'Confirming transaction...'
                    : invoiceId
                      ? 'Invoice confirmed'
                      : 'Create invoice'}
              </button>
              <span className="field-note">
                Wallet signature required · Creditcoin testnet gas applies.
              </span>
            </div>
          </form>

          {write.data ? (
            <div className="transaction-state">
              <strong>
                {receipt.isSuccess
                  ? 'Creditcoin transaction confirmed'
                  : 'Waiting for Creditcoin confirmation'}
              </strong>
              <p>
                A transaction hash alone is not treated as success. Ma'at waits
                for the receipt and validates the event.
              </p>
              <a
                href={explorerTransaction(
                  creditCoin3Testnet.blockExplorers.default.url,
                  write.data,
                )}
                target="_blank"
                rel="noreferrer"
              >
                {write.data} <ExternalLink size={11} />
              </a>
            </div>
          ) : null}

          {invoiceId ? (
            <div className="transaction-state success-state">
              <CheckCircle2 size={22} />
              <strong>Invoice created and verified</strong>
              <p>
                The receipt event matches the submitted vendor, buyer, amount,
                due time, and metadata hash.
              </p>
              {submitted?.inviteEmail ? (
                <div className={`invitation-delivery ${invitationDelivery}`}>
                  <Mail size={17} />
                  <div>
                    <strong>
                      {invitationDelivery === 'sent'
                        ? 'Buyer invitation sent'
                        : invitationDelivery === 'failed'
                          ? 'Invoice created; invitation needs attention'
                          : 'Sending buyer invitation'}
                    </strong>
                    <span>
                      {invitationDelivery === 'sent'
                        ? `Delivered to the email provider for ${submitted.inviteEmail}.`
                        : (invitationError ??
                          'The on-chain invoice is safe while email delivery completes.')}
                    </span>
                  </div>
                  {invitationDelivery === 'failed' ? (
                    <button
                      className="text-button"
                      type="button"
                      onClick={() => setInvitationDelivery('idle')}
                    >
                      Retry
                    </button>
                  ) : null}
                </div>
              ) : null}
              <InvoiceShareActions invoiceId={invoiceId} />
              <Link
                className="button-primary"
                to="/app/invoices/$invoiceId"
                params={{ invoiceId }}
              >
                Open invoice <ExternalLink size={14} />
              </Link>
            </div>
          ) : null}
        </section>

        <aside className="panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">SETTLEMENT WORKFLOW</span>
              <h2>From invoice to reconciliation</h2>
            </div>
          </div>
          <div className="network-callout">
            <Network size={20} />
            <div>
              <strong>Testnet preview</strong>
              <span>Creditcoin invoice · Ethereum USDC payment</span>
            </div>
          </div>
          <div className="proof-stack">
            <div className="proof-step complete">
              <span className="proof-dot">1</span>
              <div className="proof-copy">
                <strong>Vendor defines exact terms</strong>
                <span>
                  Dynamic buyer, amount, due date, and metadata commitment.
                </span>
              </div>
            </div>
            <div className="proof-step">
              <span className="proof-dot">2</span>
              <div className="proof-copy">
                <strong>Buyer pays in USDC</strong>
                <span>
                  The app switches to the Ethereum test environment and requests
                  the exact amount.
                </span>
              </div>
            </div>
            <div className="proof-step">
              <span className="proof-dot">3</span>
              <div className="proof-copy">
                <strong>Payment is reconciled</strong>
                <span>
                  Attestcoin verifies the transaction before Ma'at updates the
                  invoice and counterparty history.
                </span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </>
  )
}
