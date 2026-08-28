import {
  HeadContent,
  Link,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router'

import '@fontsource/instrument-serif/400.css'
import '@fontsource-variable/inter'
import '@fontsource-variable/jetbrains-mono'

import appCss from '../styles.css?url'
import { Web3Providers } from '../components/web3-providers'

import type { QueryClient } from '@tanstack/react-query'

interface MyRouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: "Ma'at | Verified USDC supplier settlement",
      },
      {
        name: 'description',
        content:
          'Issue supplier invoices, pay vendors directly in USDC, and reconcile every payment with Attestcoin-verified evidence.',
      },
      {
        name: 'theme-color',
        content: '#0c7d75',
      },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss,
      },
    ],
  }),
  notFoundComponent: NotFound,
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body suppressHydrationWarning>
        <Web3Providers>{children}</Web3Providers>
        <Scripts />
      </body>
    </html>
  )
}

function NotFound() {
  return (
    <main className="not-found-page">
      <span className="eyebrow">404 · OUT OF BALANCE</span>
      <h1>This record does not exist.</h1>
      <p>The requested route is not part of the Ma'at application.</p>
      <Link className="button-primary" to="/">
        Return home
      </Link>
    </main>
  )
}
