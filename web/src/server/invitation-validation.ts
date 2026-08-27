import { getAddress, isAddress, isHex } from 'viem'
import type { Address, Hex } from 'viem'

export interface PrepareBuyerInput {
  email: string
  vendorAddress: Address
}

export interface SendInvitationInput extends PrepareBuyerInput {
  invoiceId: Hex
}

export class ValidationError extends Error {}

export function normalizeEmail(value: unknown) {
  if (typeof value !== 'string') throw new ValidationError('Email is required.')

  const email = value.trim().toLowerCase()
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ValidationError('Enter a valid buyer email address.')
  }
  return email
}

export function parsePrepareBuyerInput(value: unknown): PrepareBuyerInput {
  const body = objectValue(value)
  return {
    email: normalizeEmail(body.email),
    vendorAddress: addressValue(body.vendorAddress, 'vendor address'),
  }
}

export function parseSendInvitationInput(value: unknown): SendInvitationInput {
  const body = objectValue(value)
  const invoiceId = body.invoiceId
  if (
    typeof invoiceId !== 'string' ||
    !isHex(invoiceId, { strict: true }) ||
    invoiceId.length !== 66
  ) {
    throw new ValidationError('A valid invoice ID is required.')
  }

  return {
    ...parsePrepareBuyerInput(body),
    invoiceId,
  }
}

function objectValue(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ValidationError('A JSON object is required.')
  }
  return value as Record<string, unknown>
}

function addressValue(value: unknown, label: string): Address {
  if (typeof value !== 'string' || !isAddress(value)) {
    throw new ValidationError(`A valid ${label} is required.`)
  }
  return getAddress(value)
}
