import { getAddress } from 'viem'
import type { Address, Hex } from 'viem'

interface AuthenticatedRequest {
  accessToken: string
  email: string
  vendorAddress: Address
}

export async function prepareInvitedBuyer(input: AuthenticatedRequest) {
  const result = await postInvitationApi<{ buyerAddress: Address }>(
    '/api/buyer-wallet',
    input.accessToken,
    { email: input.email, vendorAddress: input.vendorAddress },
  )
  return getAddress(result.buyerAddress)
}

export async function sendInvitedBuyerEmail(
  input: AuthenticatedRequest & { invoiceId: Hex },
) {
  return postInvitationApi<{ messageId: string }>(
    '/api/invoice-invitations',
    input.accessToken,
    {
      email: input.email,
      invoiceId: input.invoiceId,
      vendorAddress: input.vendorAddress,
    },
  )
}

async function postInvitationApi<T>(
  path: string,
  accessToken: string,
  body: Record<string, unknown>,
) {
  const response = await fetch(path, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const payload = (await response.json()) as { error?: string } & T
  if (!response.ok) {
    throw new Error(payload.error || 'The invitation request failed.')
  }
  return payload
}
