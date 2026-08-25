import { Link, createFileRoute } from '@tanstack/react-router'
import {
  ArrowRight,
  BadgeCheck,
  Blocks,
  CircleDollarSign,
  ExternalLink,
  FileCheck2,
  Fingerprint,
  ShieldCheck,
} from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'

import { BrandMark } from '../components/brand-mark'
import { SiteHeader } from '../components/site-header'
import { demoEvidence } from '../lib/contracts'
import { truncateAddress } from '../lib/format'

export const Route = createFileRoute('/')({ component: Home })

const workflow = [
  {
    number: '01',
    title: 'Issue invoice',
    copy: 'The vendor creates an exact USDC invoice on Creditcoin with buyer, amount, due date, and metadata commitment.',
    chain: 'CREDITCOIN',
  },
  {
    number: '02',
    title: 'Pay in USDC',
    copy: 'The buyer pays USDC directly to the vendor through the non-custodial Ethereum settlement rail.',
    chain: 'ETHEREUM',
  },
  {
    number: '03',
    title: 'Verify and reconcile',
    copy: 'Attestcoin proves the payment. Creditcoin reconciles the invoice and updates counterparty history atomically.',
    chain: 'ATTESTCOIN',
  },
]

function Home() {
  const reduceMotion = useReducedMotion()
  const enter = reduceMotion
    ? undefined
    : { initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 } }

  return (
    <div className="landing-page">
      <SiteHeader />
      <main>
        <section className="hero-section">
          <div className="hero-grid">
            <motion.div className="hero-copy" {...enter}>
              <span className="hero-kicker">
                <span className="pulse-dot" /> USDC SUPPLIER SETTLEMENT
              </span>
              <h1>
                Supplier payments,
                <br />
                <em>verified and reconciled.</em>
              </h1>
              <p>
                Issue supplier invoices, pay vendors directly in USDC, and turn
                verified settlement history into reusable business trust.
              </p>
              <div className="hero-actions">
                <Link className="button-primary" to="/app">
                  Launch app <ArrowRight size={16} />
                </Link>
                <a className="button-ghost" href="#evidence">
                  View verified settlement <ExternalLink size={15} />
                </a>
              </div>
              <div className="hero-verified-line">
                <ShieldCheck size={17} />
                <span>Non-custodial USDC payment</span>
                <span className="divider" />
                <span>Attestcoin-verified reconciliation</span>
              </div>
            </motion.div>

            <motion.div
              className="hero-object"
              initial={reduceMotion ? undefined : { opacity: 0, scale: 0.96 }}
              animate={reduceMotion ? undefined : { opacity: 1, scale: 1 }}
              transition={{ duration: 0.55, delay: 0.12 }}
            >
              <div className="orbit-label top">VERIFIED PAYMENT</div>
              <div className="orbit-label bottom">DYNAMIC TRUST</div>
              <svg
                className="maat-scale"
                viewBox="0 0 520 520"
                aria-label="Ma'at balance scale connecting Ethereum and Creditcoin"
              >
                <circle cx="260" cy="260" r="218" className="orbit outer" />
                <circle cx="260" cy="260" r="165" className="orbit inner" />
                <path
                  d="M260 120v242M145 174h230M113 363h294"
                  className="scale-frame"
                />
                <path
                  d="m145 174-60 120h120L145 174Zm230 0-60 120h120L375 174Z"
                  className="scale-bowls"
                />
                <path
                  d="M228 84c19-35 45-35 64 0-16 17-27 32-32 46-5-14-16-29-32-46Z"
                  className="feather"
                />
                <circle cx="145" cy="174" r="8" className="node" />
                <circle cx="375" cy="174" r="8" className="node" />
                <circle cx="260" cy="362" r="8" className="node" />
                <text x="145" y="318" textAnchor="middle">
                  ETH
                </text>
                <text x="375" y="318" textAnchor="middle">
                  CTC
                </text>
              </svg>
              <div className="protocol-card floating-card">
                <Fingerprint size={18} />
                <div>
                  <small>PAYMENT PROOF</small>
                  <strong>{truncateAddress(demoEvidence.paymentTx, 7)}</strong>
                </div>
                <BadgeCheck size={19} />
              </div>
            </motion.div>
          </div>
          <div className="hero-ticker" aria-label="Protocol properties">
            <span>NON-CUSTODIAL</span>
            <span>·</span>
            <span>DIRECT USDC SETTLEMENT</span>
            <span>·</span>
            <span>ATOMIC TRUST UPDATE</span>
            <span>·</span>
            <span>OPEN CREDIT POLICY</span>
          </div>
        </section>

        <section className="protocol-section" id="protocol">
          <div className="section-heading">
            <span className="eyebrow">THE PROTOCOL</span>
            <h2>Settlement is the signal.</h2>
            <p>
              Ma'at reconciles an exact commercial obligation from payment
              evidence Attestcoin has cryptographically verified.
            </p>
          </div>
          <div className="principle-grid">
            <article>
              <FileCheck2 />
              <span>01</span>
              <h3>Exact invoice terms</h3>
              <p>
                Amount, buyer, vendor, due date, and metadata commitment live on
                Creditcoin before payment.
              </p>
            </article>
            <article>
              <CircleDollarSign />
              <span>02</span>
              <h3>Direct USDC settlement</h3>
              <p>
                Funds move buyer to vendor on Ethereum. The protocol never holds
                user capital.
              </p>
            </article>
            <article>
              <Blocks />
              <span>03</span>
              <h3>Attested evidence</h3>
              <p>
                The Creditcoin verifier accepts only a valid source chain,
                router, transaction, receipt, and event.
              </p>
            </article>
            <article>
              <ShieldCheck />
              <span>04</span>
              <h3>Deterministic policy</h3>
              <p>
                Verified payment count, volume, and timeliness produce
                transparent counterparty terms and eligible limits.
              </p>
            </article>
          </div>
        </section>

        <section className="workflow-section" id="workflow">
          <div className="section-heading split-heading">
            <div>
              <span className="eyebrow">ONE BUSINESS FLOW</span>
              <h2>Across two chains.</h2>
            </div>
            <p>
              The source of money and the source of business logic stay where
              they belong. Attestcoin supplies the verification layer between
              them.
            </p>
          </div>
          <div className="workflow-list">
            {workflow.map((step) => (
              <article key={step.number}>
                <span className="workflow-number">{step.number}</span>
                <div>
                  <span className="status-pill teal">{step.chain}</span>
                  <h3>{step.title}</h3>
                  <p>{step.copy}</p>
                </div>
                <ArrowRight size={22} />
              </article>
            ))}
          </div>
        </section>

        <section className="evidence-section" id="evidence">
          <div className="evidence-copy">
            <span className="eyebrow">DON'T TRUST THE DEMO</span>
            <h2>Verify it.</h2>
            <p>
              A complete one-USDC supplier invoice has already crossed the full
              path. Every state transition remains inspectable on public testnet
              explorers.
            </p>
            <Link
              className="button-primary"
              to="/app/invoices/$invoiceId"
              params={{ invoiceId: demoEvidence.invoiceId }}
            >
              Open live invoice <ArrowRight size={16} />
            </Link>
          </div>
          <div className="evidence-ledger">
            <EvidenceRow
              label="Invoice created"
              value={demoEvidence.createTx}
              href={`https://creditcoin-testnet.blockscout.com/tx/${demoEvidence.createTx}`}
            />
            <EvidenceRow
              label="USDC paid"
              value={demoEvidence.paymentTx}
              href={`https://sepolia.etherscan.io/tx/${demoEvidence.paymentTx}`}
            />
            <EvidenceRow
              label="Attestcoin settled"
              value={demoEvidence.settlementTx}
              href={`https://creditcoin-testnet.blockscout.com/tx/${demoEvidence.settlementTx}`}
            />
            <div className="ledger-result">
              <BadgeCheck size={26} />
              <div>
                <small>RESULT</small>
                <strong>Settled on time · Bronze · $1,000 limit</strong>
              </div>
            </div>
          </div>
        </section>

        <section className="closing-section">
          <BrandMark compact />
          <h2>Truth in every transaction.</h2>
          <p>
            Build invoices. Settle across chains. Let verified behavior become
            financial reputation.
          </p>
          <Link className="button-primary" to="/app">
            Enter Ma'at <ArrowRight size={16} />
          </Link>
        </section>
      </main>
      <footer className="landing-footer">
        <BrandMark />
        <div>
          <a
            href="https://docs.creditcoin.org/attestcoin-protocol"
            target="_blank"
            rel="noreferrer"
          >
            Attestcoin docs
          </a>
          <a
            href="https://github.com/EdCryptoFi"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
        </div>
        <span>TESTNET PREVIEW · POWERED BY ATTESTCOIN</span>
      </footer>
    </div>
  )
}

function EvidenceRow({
  label,
  value,
  href,
}: {
  label: string
  value: string
  href: string
}) {
  return (
    <a className="evidence-row" href={href} target="_blank" rel="noreferrer">
      <span className="evidence-check">✓</span>
      <div>
        <small>{label}</small>
        <strong>{truncateAddress(value, 9)}</strong>
      </div>
      <ExternalLink size={15} />
    </a>
  )
}
