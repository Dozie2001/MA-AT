import { Link, createFileRoute } from '@tanstack/react-router'
import {
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  FilePlus2,
  Network,
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
import { saveInvoice } from '../lib/invoice-storage'
import { creditCoin3Testnet } from '../lib/web3'

export const Route = createFileRoute('/app/invoices/new')({
  component: NewInvoice,
})

interface SubmittedInvoice {
  buyer: Address
  amountBaseUnits: bigint
  amountDisplay: string
  dueAt: number
  metadataHash: Hex
}

function defaultDueDate() {
  const date = new Date(Date.now() + 10 * 60 * 1_000)
  date.setSeconds(0, 0)
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function NewInvoice() {
  const connection = useConnection()
  const switchChain = useSwitchChain()
  const write = useWriteContract()
  const [buyer, setBuyer] = useState('')
  const [amount, setAmount] = useState('1.00')
  const [dueAt, setDueAt] = useState(defaultDueDate)
  const [reference, setReference] = useState('')
  const [memo, setMemo] = useState('')
  const [formError, setFormError] = useState<string>()
  const [submitted, setSubmitted] = useState<SubmittedInvoice>()
  const [invoiceId, setInvoiceId] = useState<Hex>()

  const receipt = useWaitForTransactionReceipt({
    chainId: creditCoin3Testnet.id,
    hash: write.data,
    query: { enabled: Boolean(write.data) },
  })

  useEffect(() => {
    if (!receipt.data || !submitted || !connection.address || invoiceId) return

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
          decoded.args.vendor !== connection.address ||
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
        saveInvoice({
          invoiceId: decoded.args.invoiceId,
          vendor: connection.address,
          buyer: submitted.buyer,
          amount: submitted.amountDisplay,
          dueAt: submitted.dueAt,
          createTx: receipt.data.transactionHash,
          savedAt: Date.now(),
        })
        return
      } catch {
        continue
      }
    }

    setFormError(
      'Transaction confirmed, but its InvoiceCreated event was not found.',
    )
  }, [connection.address, invoiceId, receipt.data, submitted])

  async function createInvoice(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(undefined)
    write.reset()

    if (!connection.address) {
      setFormError('Connect the vendor wallet before creating an invoice.')
      return
    }
    if (!isAddress(buyer)) {
      setFormError('Enter a valid EVM buyer address.')
      return
    }

    const normalizedBuyer = getAddress(buyer)
    if (normalizedBuyer === connection.address) {
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
      amountBaseUnits,
      amountDisplay: amount,
      dueAt: dueTimestamp,
      metadataHash,
    }
    setSubmitted(terms)

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

  const pending = write.isPending || receipt.isLoading

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
            These terms are written to InvoiceRegistry on Creditcoin Testnet.
            Payment later happens in official Sepolia USDC.
          </p>
        </div>
        <StatusPill tone="teal">Creditcoin 102031</StatusPill>
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
                  Must differ from the connected vendor wallet.
                </span>
              </div>
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
                {pending
                  ? 'Confirming transaction...'
                  : invoiceId
                    ? 'Invoice confirmed'
                    : 'Create on Creditcoin'}
              </button>
              <span className="field-note">
                Wallet signature required. tCTC pays gas.
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
              <span className="eyebrow">EXECUTION BOUNDARY</span>
              <h2>What happens now</h2>
            </div>
          </div>
          <div className="network-callout">
            <Network size={20} />
            <div>
              <strong>Creditcoin transaction</strong>
              <span>InvoiceRegistry · chain 102031</span>
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
                <strong>Buyer pays on Sepolia</strong>
                <span>
                  The app will request exact USDC approval and direct
                  settlement.
                </span>
              </div>
            </div>
            <div className="proof-step">
              <span className="proof-dot">3</span>
              <div className="proof-copy">
                <strong>Worker submits proof</strong>
                <span>
                  Attestcoin verification stays outside the browser and uses no
                  user key.
                </span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </>
  )
}
