import assert from 'node:assert/strict'
import test from 'node:test'

import { buildInvitationEmail } from './invitation-email.server.ts'
import {
  ValidationError,
  normalizeEmail,
  parsePrepareBuyerInput,
  parseSendInvitationInput,
} from './invitation-validation.ts'

const vendor = '0xa6133B31d1F72E0300fa0bFbD2e0a7a78E6a4A28'
const buyer = '0x7959C2a6d5f6DDF591630e3575226A5f810d9889'
const invoiceId = `0x${'ab'.repeat(32)}`

test('normalizes and validates invitation email input', () => {
  assert.equal(normalizeEmail('  Buyer@Example.COM '), 'buyer@example.com')
  assert.throws(() => normalizeEmail('not-an-email'), ValidationError)
})

test('parses prepare and send inputs into checksummed values', () => {
  assert.deepEqual(
    parsePrepareBuyerInput({
      email: 'buyer@example.com',
      vendorAddress: vendor.toLowerCase(),
    }),
    { email: 'buyer@example.com', vendorAddress: vendor },
  )

  assert.equal(
    parseSendInvitationInput({
      email: 'buyer@example.com',
      invoiceId,
      vendorAddress: vendor,
    }).invoiceId,
    invoiceId,
  )
})

test('rejects malformed invoice IDs', () => {
  assert.throws(
    () =>
      parseSendInvitationInput({
        email: 'buyer@example.com',
        invoiceId: '0x1234',
        vendorAddress: vendor,
      }),
    ValidationError,
  )
})

test('escapes untrusted values in the email template', () => {
  const email = buildInvitationEmail({
    amountUsdc: '<script>alert(1)</script>',
    buyer,
    dueAt: new Date('2026-08-27T15:00:00.000Z'),
    invoiceId,
    invoiceUrl: 'https://maat.example/app/invoices/test?x=<unsafe>',
    vendor,
  })

  assert.doesNotMatch(email.html, /<script>/)
  assert.match(email.html, /&lt;script&gt;/)
  assert.match(email.text, /testnet preview/i)
})
