import { ClientOnly, Link } from '@tanstack/react-router'
import { Menu, X } from 'lucide-react'
import { useState } from 'react'

import { BrandMark } from './brand-mark'
import { ThemeToggle } from './theme-toggle'
import { WalletButton } from './wallet-button'

export function SiteHeader({ app = false }: { app?: boolean }) {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <header className={app ? 'site-header app-header' : 'site-header'}>
      <div className="header-inner">
        <Link to="/" className="brand-link" aria-label="Ma'at home">
          <BrandMark />
        </Link>
        <nav
          className={mobileOpen ? 'nav-links open' : 'nav-links'}
          aria-label="Primary navigation"
        >
          {app ? (
            <>
              <Link
                to="/app"
                activeOptions={{ exact: true }}
                onClick={() => setMobileOpen(false)}
              >
                Overview
              </Link>
              <Link to="/app/invoices/new" onClick={() => setMobileOpen(false)}>
                New invoice
              </Link>
              <Link
                to="/app/invoices/$invoiceId"
                params={{
                  invoiceId:
                    '0x538ff4b046151de88401b9774abde0ed1a26a39fb3976057b551ab1f1f38b740',
                }}
                onClick={() => setMobileOpen(false)}
              >
                Live proof
              </Link>
            </>
          ) : (
            <>
              <a href="#protocol" onClick={() => setMobileOpen(false)}>
                Protocol
              </a>
              <a href="#workflow" onClick={() => setMobileOpen(false)}>
                Workflow
              </a>
              <a href="#evidence" onClick={() => setMobileOpen(false)}>
                Evidence
              </a>
              <Link to="/app" onClick={() => setMobileOpen(false)}>
                Open app
              </Link>
            </>
          )}
        </nav>
        <div className="header-actions">
          <ThemeToggle />
          <ClientOnly
            fallback={
              <div className="wallet-trigger skeleton-wallet">Wallet</div>
            }
          >
            <WalletButton />
          </ClientOnly>
          <button
            className="icon-button mobile-menu-button"
            type="button"
            onClick={() => setMobileOpen((open) => !open)}
            aria-expanded={mobileOpen}
            aria-label="Toggle navigation"
          >
            {mobileOpen ? <X size={19} /> : <Menu size={19} />}
          </button>
        </div>
      </div>
    </header>
  )
}
