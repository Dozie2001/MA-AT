import { createFileRoute } from '@tanstack/react-router'

import {
  InvitationApiError,
  prepareBuyerWallet,
} from '../server/invitations.server'
import {
  ValidationError,
  parsePrepareBuyerInput,
} from '../server/invitation-validation'

export const Route = createFileRoute('/api/buyer-wallet')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const input = parsePrepareBuyerInput(await request.json())
          return json(await prepareBuyerWallet(request, input))
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
  console.error('Buyer wallet preparation failed', error)
  return json({ error: 'Buyer wallet preparation failed.' }, { status: 500 })
}
