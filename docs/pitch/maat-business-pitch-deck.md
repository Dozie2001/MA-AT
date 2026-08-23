# MA'AT

## Business-Friendly Pitch Deck Brief

**Audience:** Creditcoin BUIDL For The Real World judges

**Stage:** Working testnet MVP

**Founder:** Doize, Solo Founder and Software Engineer

**Product:** [ma-at-xi.vercel.app](https://ma-at-xi.vercel.app)
**Repository:** [github.com/Dozie2001/MA-AT](https://github.com/Dozie2001/MA-AT)

> **Business trust, proven in settlement.**

Ma'at is a cross-chain B2B settlement rail that turns verified Ethereum USDC
payments into settled invoices, durable counterparty history, and
machine-readable credit policy on Creditcoin.

The business hook is simple:

> **A payment should not end as a transaction hash. It should become a reusable
> trade reference.**

---

## What Changed In The Product

### Batch settlement

Ma'at can now verify and settle between 2 and 10 invoice payments in one
Creditcoin transaction when their Attestcoin proofs share a continuity proof.

- The batch is atomic: every invoice settles correctly or the entire batch
  reverts.
- Each payment still receives invoice-level and source-query replay protection.
- Payer and vendor histories update inside the same transaction.
- Shared proof infrastructure reduces repeated reconciliation overhead for
  treasury batches.
- A live two-invoice batch has been executed on Creditcoin Testnet.

This is currently protocol and worker infrastructure, not a manual batch button
in the customer dashboard. Present it as the operational scale path behind the
product, not as an unsupported UI claim.

### Durable audit history

The application now reads both the current batch-enabled deployment and the
previous deployment.

- Previous invoices remain visible after a contract upgrade.
- Old invoice links continue to resolve as verifiable, read-only records.
- Lifetime payer history combines verified settlements from both deployments.
- Paid and received volumes are shown separately, so buyer and vendor wallets
  are represented correctly.
- New writes use only the active batch-enabled contracts.

For the verified demo wallets, the lifetime view is:

| Wallet role | Address         | Verified result                                 |
| ----------- | --------------- | ----------------------------------------------- |
| Buyer       | `0xa613...4A28` | 6 invoices, 4 on time, 2 late, `4.02 USDC` paid |
| Vendor      | `0x7959...9889` | 6 invoices, `4.02 USDC` received                |

These values are engineering evidence on testnet, not customer traction.

---

## Core Selling Point

### Ma'at turns settlement into an asset businesses can reuse

Most payment products stop after moving money. Ma'at adds three business layers:

1. **Reconciliation:** prove that a specific buyer paid the exact vendor, amount,
   and invoice through the approved source contract.
2. **Auditability:** preserve a public settlement trail that does not depend on
   one platform's private database.
3. **Trust:** convert verified payment behavior into machine-readable terms for
   supplier finance, treasury automation, or autonomous agents.

Attestcoin is load-bearing. Without it, Creditcoin would have to trust Ma'at's
worker to report what happened on Ethereum. With it, the worker proposes proof
data while Creditcoin verifies the source transaction and enforces the business
rules.

### One-line differentiation

> **Payment platforms move funds. Ma'at makes verified payment behavior reusable.**

### Spoken protocol explanation

> **Ethereum moves the money. Attestcoin proves the payment. Creditcoin remembers
> the business relationship.**

### Current chain scope

Ma'at is cross-chain because payment happens on an Attestcoin-supported source
chain while invoice settlement and trust logic execute on Creditcoin.

- **Working MVP:** Ethereum Sepolia payments -> Creditcoin CC3 Testnet.
- **Published mainnet path:** Ethereum Mainnet -> Creditcoin CC3 Mainnet.
- **Solana:** not listed in the current Attestcoin supported-chain matrix. A
  Solana integration is therefore a conditional roadmap item, not a current
  product capability.

When Attestcoin officially supports Solana, Ma'at would still need a Solana
payment program or adapter, a Solana transaction/event decoder on Creditcoin,
proof-worker support, wallet UX, and end-to-end security tests.

Source: [Attestcoin Protocol Chains and Environments](https://docs.creditcoin.org/attestcoin-protocol/attestcoin-protocol-chains-environments)

---

## Anchor Real-World Use Case

### Cross-border supplier settlement

A distributor buys inventory from multiple overseas suppliers and settles those
invoices in stablecoins.

1. Each supplier invoice is committed on Creditcoin with the buyer, vendor,
   exact amount, and due date.
2. The distributor pays each supplier directly in USDC on Ethereum.
3. Attestcoin independently proves the Ethereum payment to Creditcoin.
4. Ma'at reconciles the exact obligation and updates paid, received, on-time,
   and late settlement history.
5. The finance team can settle compatible invoice proofs in batches of up to
   ten.
6. With sufficient real-world controls, a lender or treasury system could use
   the verified history when offering supplier terms or working capital.

### Why a business would care

- Less manual matching between invoices and blockchain transfers
- An audit trail that counterparties can independently inspect
- Direct vendor payment without Ma'at taking custody
- Durable history that survives application or contract upgrades
- A path from payment operations to data-driven supplier finance

### Honest boundary

The current MVP proves settlement behavior. A production supplier-finance
product would also require business identity, legal invoice validation,
fulfillment evidence, sanctions/compliance controls, dispute handling, validated
underwriting, and appropriate regulated partners.

---

## Ten-Slide Deck

### Slide 1: Business trust, proven in settlement

**On slide**

- Ma'at logo and product screenshot
- “Cross-chain B2B settlement that becomes reusable trust”
- Working on Ethereum Sepolia and Creditcoin Testnet

**Speaker note**

“A transaction hash proves money moved. It does not automatically reconcile an
invoice, build a portable payment record, or tell another application whether a
counterparty deserves better terms. Ma'at turns settlement into reusable
business trust.”

### Slide 2: The business problem

**On slide**

- Invoice terms, stablecoin payment, reconciliation, and risk data live in
  separate systems.
- Businesses rely on a platform or indexer to declare that a cross-chain payment
  matched an obligation.
- Payment history remains trapped in private databases.

**Speaker note**

“Cross-chain payment is possible, but cross-chain business truth is fragmented.
The party operating the dashboard often becomes the party everyone must trust.”

### Slide 3: Why now

**On slide**

- B2B stablecoin payment activity is growing.
- Businesses need programmable reconciliation and treasury controls.
- Attestcoin gives Creditcoin contracts decentralized verification of supported
  foreign-chain transactions.

**Speaker note**

“Stablecoins are becoming business payment rails. The missing layer is a
credible way to turn those payments into shared business state without adding a
central oracle operator.”

Use the `$76B` annualized B2B stablecoin payment figure only with its source and
date: [Artemis, October 2025](https://about.artemis.ai/resources/stablecoin-update-october-2025).

### Slide 4: One invoice, one verifiable outcome

**On slide**

```text
Vendor creates invoice on Creditcoin
                ↓
Buyer pays vendor directly in Ethereum USDC
                ↓
Attestcoin proves the source transaction
                ↓
Creditcoin settles invoice and updates trust
```

**Business benefits**

- Direct, non-custodial vendor payment
- Exact invoice reconciliation
- Public audit record
- Replay-safe settlement

**Speaker note**

“Ma'at never takes custody of the vendor's payment. The buyer pays the vendor
directly. Attestcoin carries verified evidence, and Creditcoin applies the
invoice rules.”

### Slide 5: From payment history to better terms

**On slide**

- Verified paid volume
- Verified received volume
- On-time versus late settlement history
- Deterministic policy output

**Speaker note**

“The output is not only a settled invoice. It is a payment record another
contract, treasury system, or agent can consume. That creates a path from cash
settlement to supplier financing and automated payment terms.”

Be explicit that the current Bronze/Silver/Gold policy is a testnet
demonstration, not production underwriting.

### Slide 6: Batch settlement for treasury operations

**On slide**

- 2 to 10 payments
- One shared Attestcoin continuity proof
- One atomic Creditcoin transaction
- Every invoice and trust update succeeds or all revert

**Speaker note**

“Businesses do not reconcile one invoice at a time forever. Ma'at's new batch
path lets a treasury operator submit up to ten compatible proofs together while
preserving invoice-level validation. This is the bridge from a demo payment to a
practical settlement operation.”

Do not claim a measured percentage cost reduction. Say that the continuity proof
is shared and repeated settlement overhead is amortized.

### Slide 7: A durable audit trail through upgrades

**On slide**

- Current and legacy Creditcoin records shown in one lifetime view
- Buyer paid volume and vendor received volume shown separately
- Historical invoices remain inspectable and read-only
- New business uses the active batch-enabled deployment

**Speaker note**

“Financial history cannot disappear when software is upgraded. Ma'at now keeps
the audit trail continuous across contract versions while ensuring all new
writes use the latest verifier.”

### Slide 8: Attestcoin is the trust boundary

**On slide**

```text
Sepolia payment
      ↓
Attestcoin Merkle + continuity evidence
      ↓
Creditcoin native verifier (0x...0FD2)
      ↓
Ma'at semantic receipt decoder
      ↓
Invoice + payer trust + vendor history
```

**Speaker note**

“The worker cannot invent the payer, vendor, amount, timestamp, invoice ID, or
transaction success. Those values are derived from the receipt accepted through
Attestcoin and matched against Creditcoin invoice terms.”

### Slide 9: Roadmap from settlement to financing

**On slide**

| Phase                     | Business outcome                                             | Product work                                                                                                               |
| ------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| **Now: prove and settle** | Working cross-chain invoice reconciliation                   | Ethereum Sepolia, Creditcoin Testnet, Attestcoin verification, batch settlement, lifetime audit history                    |
| **Next: pilot safely**    | Businesses can test recurring supplier workflows             | persistent job queue, monitoring, role-based approvals, partial payments, refunds, disputes, KYB/document integrations     |
| **Then: expand rails**    | Move from testnet workflow to supported production corridors | security review, Ethereum/Creditcoin mainnet deployment, additional EVM adapters only where Attestcoin support is verified |
| **Later: finance trust**  | Verified history becomes usable for capital allocation       | supplier-finance integrations, treasury API/SDK, risk-policy modules, agent-readable controls                              |

**Conditional ecosystem expansion:** add Solana only after it appears in
Attestcoin's official supported-chain matrix and Ma'at completes a Solana source
adapter, decoder, wallet flow, and end-to-end verification tests.

**Potential business model**

- Settlement fee per verified invoice or batch
- SaaS fee for treasury workflow, reporting, and controls
- API fee for verified counterparty and policy data

**Go-to-market hypothesis**

- Stablecoin-native exporters and suppliers
- Cross-border marketplaces
- Treasury platforms that need independently verifiable payment evidence

**Speaker note**

“The wedge is reconciliation, a concrete workflow with an obvious buyer. We
first make the workflow pilot-ready, then move to supported mainnet corridors.
The longer-term asset is the verified relationship history produced by
settlement.”

These are business-model hypotheses. Do not present them as current revenue,
users, partnerships, or validated demand.

Roadmap phases are product intent, not completed milestones or guaranteed dates.

### Slide 10: Founder, proof, and ask

**On slide**

- Doize, Solo Founder and Software Engineer
- Background across AI, blockchain security, and robotics
- Working contracts, worker, cloud deployment, and customer application
- Ask: hackathon recognition and CEIP fast-track consideration

**Speaker note**

“I built Ma'at end to end to show that Attestcoin can support practical business
infrastructure, not only generic cross-chain messaging. I am seeking the CEIP
fast track to deepen the protocol integration and develop real settlement
pilots.”

Use Doize's GitHub profile image and supplied links:

- [GitHub](https://github.com/Dozie2001)
- [LinkedIn](https://www.linkedin.com/in/chidozie-david-982144203/)

---

## Verified Technical Evidence

### Active deployment

| Component              | Network            | Address                                      |
| ---------------------- | ------------------ | -------------------------------------------- |
| SettlementRouter       | Ethereum Sepolia   | `0xCf3D8C3a3ADD06E8d4737f3AfF120e3257122fAe` |
| InvoiceRegistry        | Creditcoin Testnet | `0xACD97e1980ba6E7E5eD142e1064E7929E43f1405` |
| MaatTrustRegistry      | Creditcoin Testnet | `0x075B6a3c8526413856Bb9a418C37fbE1aBA1BcA5` |
| MaatSettlementVerifier | Creditcoin Testnet | `0x99d48BFA0a9713B9BDec032bd07785D010C8c666` |
| MaatCreditPolicy       | Creditcoin Testnet | `0xd02F1f044B20551763eF815778B561969E3EF70D` |

### Live batch proof

| Evidence                     | Value                                                                                                                              |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Batch settlement transaction | [`0x30e1...6b56`](https://creditcoin-testnet.blockscout.com/tx/0x30e1b646998d2bd5cd523048d7b65d60a83fa2f13974338dd07585c6755c6b56) |
| Number of invoices           | 2                                                                                                                                  |
| Shared source-height range   | `11538393` to `11538565`                                                                                                           |
| Result                       | Both invoices settled atomically; payer and vendor histories updated                                                               |

### Validation status

- 46 Hardhat contract tests passing
- 21 worker tests passing
- frontend ESLint passing
- frontend production build passing
- live current and legacy event queries verified
- public production dashboard and legacy invoice route returning successfully

---

## Demo Sequence

Use a pre-settled invoice for the recorded pitch. Attestcoin publication latency
should not consume presentation time.

1. Connect the buyer wallet and show `4.02 USDC` verified paid volume across six
   settlements.
2. Connect the vendor wallet and show `4.02 USDC` verified received volume.
3. Open a legacy invoice and show that the audit record still resolves as
   read-only.
4. Open a current settled invoice and walk through invoice terms, source payment,
   Attestcoin proof, and trust update.
5. Open the batch settlement transaction and show that one Creditcoin
   transaction settled two invoices.
6. Close with: “Ethereum moves the money. Attestcoin proves the payment.
   Creditcoin remembers the business relationship.”

For a live customer flow:

1. Vendor creates an invoice on Creditcoin.
2. Vendor shares the generated customer link.
3. Buyer connects and switches to Sepolia when prompted.
4. Buyer approves the exact USDC amount and pays the vendor directly.
5. The app shows the payment while awaiting Attestcoin publication.
6. The worker submits proof and Creditcoin atomically settles the invoice and
   updates trust.

The live customer flow currently settles individual invoices automatically. The
batch path is demonstrated through the worker command and verified on-chain
transaction, not through a customer-facing batch UI.

---

## Required Screenshots

Capture these from the current production application before generating slides:

1. Landing page hero and three-chain flow.
2. Connected buyer dashboard showing verified paid volume.
3. Connected vendor dashboard showing verified received volume.
4. Invoice creation form with dynamic buyer, amount, and due date.
5. Settled invoice verification timeline.
6. Downloadable Attestcoin proof receipt details.
7. Historical invoice with the legacy read-only notice.
8. Creditcoin explorer page for the live batch transaction.

Do not use stale screenshots showing only one registry's volume.

---

## Visual Direction

**Premium financial infrastructure with restrained cyberpunk and Egyptian
archival motifs.**

- Base: `#01090D`
- Elevated surface: `#02141B`
- Verification teal: `#0AC5B4`
- Provenance copper: `#DF8352`
- Papyrus text: `#F6F1E9`
- Instrument Serif for slide headlines
- Inter for body copy
- JetBrains Mono for addresses and proof fields

Use teal for verified state, copper for provenance and history, and papyrus for
business copy. Avoid purple gradients, stock photography, generic glassmorphism,
and crowded architecture diagrams.

---

## Claims To Avoid

- Do not claim mainnet usage, customer adoption, revenue, or partnerships.
- Do not describe testnet volume as commercial traction.
- Do not claim production creditworthiness or underwriting.
- Do not claim Ma'at verifies legal invoice validity, delivery, KYB, or business
  identity.
- Do not call Ma'at a bridge; funds remain on Ethereum and move directly from
  buyer to vendor.
- Do not call the current MVP an autonomous AI product. It is agent-ready because
  policy and history are machine-readable.
- Do not claim automatic UI-driven batch settlement. The tested batch path is
  contract and worker infrastructure.

---

## Final Deck-Generator Prompt

```text
Create a 10-slide, 3-to-4-minute business-friendly hackathon pitch deck for
Ma'at using this document as the factual source of truth.

Lead with the business problem and outcome, not blockchain mechanics. Position
Ma'at as a cross-chain B2B settlement rail that turns independently verified
Ethereum USDC payments into reconciled invoices, durable counterparty history,
and machine-readable policy on Creditcoin.

Make two product advances clear:
1. batch-capable Attestcoin verification settles 2 to 10 compatible invoice
   payments atomically in one Creditcoin transaction; and
2. the app preserves lifetime buyer and vendor audit history across contract
   upgrades, showing paid and received volume separately.

Use the protocol detail to establish defensibility: the worker proposes proof
data, Attestcoin verifies the source transaction, and Creditcoin contracts derive
and enforce the payer, vendor, amount, timestamp, success status, and replay
rules.

Use the supplied dark teal, copper, and papyrus visual system. Include concise
speaker notes, a 90-second demo sequence, the live batch explorer transaction,
and the solo-founder slide. Do not invent users, revenue, partnerships, market
validation, or production underwriting claims.
```
