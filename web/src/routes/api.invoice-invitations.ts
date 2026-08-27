import { createFileRoute } from '@tanstack/react-router'

import {
  InvitationApiError,
  sendInvoiceInvitation,
} from '../server/invitations.server'
import {
  ValidationError,
  parseSendInvitationInput,
} from '../server/invitation-validation'

export const Route = createFileRoute('/api/invoice-invitations')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const input = parseSendInvitationInput(await request.json())
          return json(await sendInvoiceInvitation(request, input))
        } catch (error) {
          return apiError(error)
        }
      },
    },
  },
})

function json(value: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers)
  headers.set('Cache-Control', 'no-store')
  return Response.json(value, { ...init, headers })
}

function apiError(error: unknown) {
  if (error instanceof ValidationError) {
    return json({ error: error.message }, { status: 400 })
  }
  if (error instanceof InvitationApiError) {
    return json({ error: error.message }, { status: error.status })
  }
  console.error('Invoice invitation failed', error)
  return json({ error: 'Invoice invitation failed.' }, { status: 500 })
}
