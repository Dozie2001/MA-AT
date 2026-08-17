import { Outlet } from '@tanstack/react-router'

import { SiteHeader } from './site-header'

export function AppShell() {
  return (
    <div className="app-page">
      <SiteHeader app />
      <main className="app-main">
        <Outlet />
      </main>
      <footer className="app-footer">
        <span>Ma'at testnet application</span>
        <span>Sepolia · Attestcoin · Creditcoin 102031</span>
      </footer>
    </div>
  )
}
