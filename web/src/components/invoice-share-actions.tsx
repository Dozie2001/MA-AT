import { Check, Copy, Share2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Hex } from 'viem'

type Feedback = 'id' | 'link' | 'shared' | 'error'

function customerUrl(invoiceId: Hex) {
  return new URL(
    `/app/invoices/${invoiceId}`,
    window.location.origin,
  ).toString()
}

export function InvoiceShareActions({ invoiceId }: { invoiceId: Hex }) {
  const [feedback, setFeedback] = useState<Feedback>()

  useEffect(() => {
    if (!feedback) return
    const timeout = window.setTimeout(() => setFeedback(undefined), 2_000)
    return () => window.clearTimeout(timeout)
  }, [feedback])

  async function copy(value: string, success: Feedback) {
    try {
      await navigator.clipboard.writeText(value)
      setFeedback(success)
    } catch {
      setFeedback('error')
    }
  }

  async function shareInvoice() {
    const url = customerUrl(invoiceId)
    const nativeShare = (
      navigator as unknown as {
        share?: (data: ShareData) => Promise<void>
      }
    ).share

    if (!nativeShare) {
      await copy(url, 'link')
      return
    }

    try {
      await nativeShare.call(navigator, {
        title: "Ma'at invoice",
        text: 'Review and pay this verified cross-chain invoice.',
        url,
      })
      setFeedback('shared')
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setFeedback('error')
    }
  }

  return (
    <div className="invoice-share">
      <div className="invoice-id-row">
        <div>
          <span>Invoice ID</span>
          <code>{invoiceId}</code>
        </div>
        <button
          className="icon-button"
          type="button"
          onClick={() => copy(invoiceId, 'id')}
          aria-label="Copy invoice ID"
        >
          {feedback === 'id' ? <Check size={16} /> : <Copy size={16} />}
        </button>
      </div>

      <div className="invoice-share-actions">
        <button
          className="button-secondary"
          type="button"
          onClick={() => copy(customerUrl(invoiceId), 'link')}
        >
          {feedback === 'link' ? <Check size={16} /> : <Copy size={16} />}
          {feedback === 'link' ? 'Customer link copied' : 'Copy customer link'}
        </button>
        <button className="button-ghost" type="button" onClick={shareInvoice}>
          {feedback === 'shared' ? <Check size={16} /> : <Share2 size={16} />}
          {feedback === 'shared' ? 'Shared' : 'Share invoice'}
        </button>
      </div>

      <span className="share-feedback" role="status" aria-live="polite">
        {feedback === 'error'
          ? 'Could not share or copy. Copy the invoice URL from your browser.'
          : feedback === 'id'
            ? 'Invoice ID copied.'
            : feedback === 'link'
              ? 'Customer link copied.'
              : feedback === 'shared'
                ? 'Invoice shared.'
                : 'Anyone with this link can inspect the invoice. The buyer wallet is required to pay.'}
      </span>
    </div>
  )
}
