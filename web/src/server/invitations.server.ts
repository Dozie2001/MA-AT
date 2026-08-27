import { ConflictError, NotFoundError, PrivyClient } from '@privy-io/node'
import type { User } from '@privy-io/node'
import { Resend } from 'resend'
import { createPublicClient, formatUnits, getAddress, http } from 'viem'
import type { Address, Hex } from 'viem'
import { creditCoin3Testnet } from 'viem/chains'

import { contracts, invoiceRegistryAbi } from '../lib/contracts'
import { buildInvitationEmail } from './invitation-email.server'
import type {
  PrepareBuyerInput,
  SendInvitationInput,
} from './invitation-validation'

const rateLimitBuckets = new Map<string, number[]>()

export class InvitationApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

export async function prepareBuyerWallet(
  request: Request,
  input: PrepareBuyerInput,
) {
  assertSameOrigin(request)
  const { client, userId } = await requireVendor(request, input.vendorAddress)
  enforceRateLimit(`prepare:${userId}`, 10, 10 * 60_000)

  const user = await findOrCreateEmailUser(client, input.email)
  const wallet =
    findEmbeddedEthereumWallet(user) ??
    findEmbeddedEthereumWallet(
      await client.users().pregenerateWallets(user.id, {
        wallets: [{ chain_type: 'ethereum', wallet_index: 0 }],
      }),
    )

  if (!wallet) {
    throw new InvitationApiError(
      'Privy did not return an embedded Ethereum wallet.',
      502,
    )
  }

  return { buyerAddress: getAddress(wallet.address) }
}

export async function sendInvoiceInvitation(
  request: Request,
  input: SendInvitationInput,
) {
  assertSameOrigin(request)
  const { client, userId } = await requireVendor(request, input.vendorAddress)
  enforceRateLimit(`send:${userId}`, 10, 10 * 60_000)

  const buyerUser = await getEmailUser(client, input.email)
  const embeddedWallet = findEmbeddedEthereumWallet(buyerUser)
  if (!embeddedWallet) {
    throw new InvitationApiError(
      'The invited buyer does not have a prepared Ethereum wallet.',
      409,
    )
  }

  const creditcoinClient = createPublicClient({
    chain: creditCoin3Testnet,
    transport: http(process.env.CREDITCOIN_RPC_URL?.trim() || undefined),
  })
  const invoice = await creditcoinClient.readContract({
    address: contracts.invoiceRegistry,
    abi: invoiceRegistryAbi,
    functionName: 'getInvoice',
    args: [input.invoiceId],
  })

  if (invoice.status !== 1) {
    throw new InvitationApiError('The invoice is not open.', 409)
  }
  if (invoice.vendor !== input.vendorAddress) {
    throw new InvitationApiError(
      'The authenticated wallet did not create this invoice.',
      403,
    )
  }
  if (invoice.buyer !== getAddress(embeddedWallet.address)) {
    throw new InvitationApiError(
      'The invoice buyer does not match the invited email wallet.',
      409,
    )
  }

  const resendApiKey = requiredEnv('RESEND_API_KEY')
  const from = requiredEnv('INVITE_FROM_EMAIL')
  const appOrigin = publicAppOrigin(request)
  const invoiceUrl = new URL(
    `/app/invoices/${input.invoiceId}`,
    appOrigin,
  ).toString()
  const email = buildInvitationEmail({
    amountUsdc: formatUnits(invoice.amount, 6),
    buyer: invoice.buyer,
    dueAt: new Date(Number(invoice.dueAt) * 1_000),
    invoiceId: input.invoiceId,
    invoiceUrl,
    vendor: invoice.vendor,
  })
  const resend = new Resend(resendApiKey)
  const result = await resend.emails.send(
    {
      from,
      to: [input.email],
      subject: email.subject,
      html: email.html,
      text: email.text,
      tags: [{ name: 'category', value: 'invoice_invitation' }],
    },
    { idempotencyKey: `maat-invoice/${input.invoiceId}` },
  )

  if (result.error) {
    throw new InvitationApiError(result.error.message, 502)
  }

  return { messageId: result.data.id }
}

async function requireVendor(request: Request, vendorAddress: Address) {
  const authorization = request.headers.get('authorization')
  const match = authorization?.match(/^Bearer (\S+)$/)
  if (!match) throw new InvitationApiError('Authentication required.', 401)

  const client = createPrivyClient()
  let claims
  try {
    claims = await client.utils().auth().verifyAccessToken(match[1])
  } catch {
    throw new InvitationApiError('Your session is invalid or expired.', 401)
  }

  const user = await client.users()._get(claims.user_id)
  const ownsVendorWallet = user.linked_accounts.some((account) => {
    if (account.type !== 'wallet' || account.chain_type !== 'ethereum') {
      return false
    }
    try {
      return getAddress(account.address) === vendorAddress
    } catch {
      return false
    }
  })
  if (!ownsVendorWallet) {
    throw new InvitationApiError(
      'The vendor wallet is not linked to the authenticated account.',
      403,
    )
  }

  return { client, userId: claims.user_id }
}

async function findOrCreateEmailUser(client: PrivyClient, email: string) {
  try {
    return await client.users().getByEmailAddress({ address: email })
  } catch (error) {
    if (!(error instanceof NotFoundError)) throw error
  }

  try {
    return await client.users().create({
      linked_accounts: [{ type: 'email', address: email }],
      wallets: [{ chain_type: 'ethereum', wallet_index: 0 }],
    })
  } catch (error) {
    if (!(error instanceof ConflictError)) throw error
    return getEmailUser(client, email)
  }
}

async function getEmailUser(client: PrivyClient, email: string) {
  try {
    return await client.users().getByEmailAddress({ address: email })
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw new InvitationApiError('Prepare the buyer wallet first.', 409)
    }
    throw error
  }
}

function findEmbeddedEthereumWallet(user: User) {
  return user.linked_accounts.find(
    (account) =>
      account.type === 'wallet' &&
      account.chain_type === 'ethereum' &&
      account.connector_type === 'embedded' &&
      account.wallet_client_type === 'privy',
  )
}

function createPrivyClient() {
  return new PrivyClient({
    appId: requiredEnv('PRIVY_APP_ID'),
    appSecret: requiredEnv('PRIVY_APP_SECRET'),
  })
}

function assertSameOrigin(request: Request) {
  const origin = request.headers.get('origin')
  const allowedOrigins = new Set([new URL(request.url).origin])
  const configuredOrigin = process.env.PUBLIC_APP_URL?.trim()
  if (configuredOrigin)
    allowedOrigins.add(parseConfiguredOrigin(configuredOrigin))

  let requestOrigin: string | undefined
  try {
    requestOrigin = origin ? new URL(origin).origin : undefined
  } catch {
    requestOrigin = undefined
  }
  if (!requestOrigin || !allowedOrigins.has(requestOrigin)) {
    throw new InvitationApiError('Origin check failed.', 403)
  }
}

function publicAppOrigin(request: Request) {
  const configuredOrigin = process.env.PUBLIC_APP_URL?.trim()
  return configuredOrigin
    ? parseConfiguredOrigin(configuredOrigin)
    : new URL(request.url).origin
}

function parseConfiguredOrigin(value: string) {
  try {
    return new URL(value).origin
  } catch {
    throw new InvitationApiError('PUBLIC_APP_URL is invalid.', 503)
  }
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new InvitationApiError(
      `Server configuration ${name} is missing.`,
      503,
    )
  }
  return value
}

function enforceRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now()
  const recent = (rateLimitBuckets.get(key) ?? []).filter(
    (timestamp) => timestamp > now - windowMs,
  )
  if (recent.length >= limit) {
    throw new InvitationApiError(
      'Too many invitation requests. Try again later.',
      429,
    )
  }
  recent.push(now)
  rateLimitBuckets.set(key, recent)
}
