import type { Address, Hex } from 'viem'

export interface SavedInvoice {
  invoiceId: Hex
  vendor: Address
  buyer: Address
  amount: string
  dueAt: number
  createTx: Hex
  savedAt: number
}

const storageKey = 'maat:saved-invoices:v1'

export function getSavedInvoices(): Array<SavedInvoice> {
  if (typeof window === 'undefined') return []

  try {
    const value = window.localStorage.getItem(storageKey)
    return value ? JSON.parse(value) : []
  } catch {
    return []
  }
}

export function saveInvoice(invoice: SavedInvoice) {
  const invoices = getSavedInvoices().filter(
    (saved) => saved.invoiceId !== invoice.invoiceId,
  )
  window.localStorage.setItem(
    storageKey,
    JSON.stringify([invoice, ...invoices]),
  )
}
