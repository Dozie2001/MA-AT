# Ma'at

**Settle an Ethereum invoice on Creditcoin. Turn the verified payment into business trust.**

Ma'at is a cross-chain B2B settlement and reputation protocol built for the Creditcoin Attestcoin hackathon. A vendor creates an invoice on Creditcoin, a buyer pays USDC on Ethereum, and Attestcoin proves the payment back to Creditcoin. One verified source-chain fact then settles the invoice, updates payer and vendor history, and changes machine-readable credit policy.

[Open the live app](https://ma-at-xi.vercel.app)

## The Problem

Cross-chain business payments usually split one obligation across unrelated systems:

- the invoice records who should pay, how much, and by when;
- the payment processor records whether funds moved;
- a reconciliation service decides whether the records match;
- a credit system asks an operator or indexer which history to trust.

Putting these steps on-chain does not solve the trust problem if a backend can still claim that any payment settled any invoice. A useful settlement record must prove the source transaction and derive its business meaning from the verified receipt.

## What Ma'at Does

```text
Creditcoin Testnet                          Ethereum Sepolia
------------------                         -----------------
Vendor creates invoice                     Buyer approves USDC
  buyer, vendor, amount, dueAt                    |
  metadataHash                                    v
        |                                  SettlementRouter
        |                                  transfers USDC directly
        |                                  to the vendor and emits
        |                                  InvoicePaid
        |                                         |
        |                       Attestcoin attests the Sepolia block
        |                                         |
        v                                         v
MaatSettlementVerifier <--- encoded tx + Merkle proof + continuity proof
        |
        | verify at precompile 0x0FD2
        | decode the successful receipt on-chain
        | match invoiceId + payer + vendor + amount
        v
InvoiceRegistry ----> MaatTrustRegistry ----> MaatCreditPolicy
invoice settled       payment behavior         terms eligibility
```

USDC moves directly from buyer to vendor on Sepolia. Ma'at does not custody or bridge the payment. Creditcoin holds the invoice, the attested settlement result, and the trust state built from verified behavior.

## Why This Is More Than a Payment Gate

The obvious Attestcoin integration proves one event and unlocks one action. Ma'at uses that proof as a semantic reconciliation primitive:

| Generic cross-chain gate | Ma'at |
| --- | --- |
| Proves that a transaction was included | Proves inclusion and requires a successful source receipt |
| Trusts submitted business fields | Derives invoice ID, payer, vendor, amount, and payment time from the receipt |
| Releases one action | Atomically settles the invoice and updates payer and vendor trust |
| Checks whether something happened | Checks whether the correct buyer paid the correct vendor the exact amount |
| Treats time as backend metadata | Compares the attested payment timestamp with the on-chain due date |

Ma'at is also distinct from retrospective repayment-history underwriting. Its primary object is an active commercial invoice, its source event is the direct USDC settlement, and its decision is whether that exact obligation was fulfilled. The current MVP intentionally uses one proof per invoice rather than batch proofs over a historical loan dataset.

## Attestcoin Integration

Attestcoin is load-bearing in the settlement path. The worker can discover a payment and propose its proof, but it cannot choose the facts credited to a payer or vendor.

| Mechanism | How Ma'at uses it |
| --- | --- |
| Own Attestcoin Smart Contract | `MaatSettlementVerifier` is the Creditcoin entry point for verified settlements. |
| Own source event | `InvoicePaid(bytes32,address,address,uint256,uint256)` is emitted only after the router transfers USDC to the vendor. |
| Block prover precompile | The verifier calls Attestcoin at `0x0000000000000000000000000000000000000FD2`. |
| Inclusion verification | `verify` checks the encoded Sepolia transaction with its Merkle and continuity proofs. |
| On-chain receipt decoding | `AttestedPaymentDecoder` extracts the canonical event from the attested transaction envelope. |
| Source binding | Immutable chain key `1` and immutable router address prevent proofs from an unexpected chain or contract. |
| Success enforcement | Receipt status must equal `1`; transaction inclusion alone is not accepted as payment. |
| Semantic matching | Creditcoin requires the attested payer, vendor, amount, and invoice ID to match the open invoice exactly. |
| Time verification | `paidAt` comes from the source event and determines whether settlement was on time. |
| Replay protection | The verifier rejects a reused `(chainKey, height, txIndex)`, and the trust registry rejects a reused invoice ID. |

### Proof Lifecycle

1. The worker scans the immutable Sepolia `SettlementRouter` for `InvoicePaid` logs.
2. It reads the corresponding Creditcoin invoice and rejects mismatched or closed invoices before requesting a proof.
3. It waits until Attestcoin's attested height covers the Sepolia payment block.
4. It requests `encodedTransaction`, a Merkle proof, and a continuity proof from the CC3 proof generator.
5. It simulates `submitVerifiedSettlement` on Creditcoin before sending the transaction.
6. The Creditcoin contract verifies and decodes the proof, then settles the invoice and updates trust in one atomic transaction.
7. If any proof, receipt, source, or invoice check fails, the entire Creditcoin transaction reverts.

## On-Chain Trust

Every accepted settlement updates deterministic Creditcoin state:

- payer metrics: settled count, on-time count, late count, total USDC paid, latest settlement, and tier;
- vendor metrics: settled count, total USDC received, and latest settlement;
- policy output: whether the current tier permits a requested invoice amount.

The MVP tiers are transparent demonstration policy, not production underwriting. Bronze begins after one verified settlement; Silver and Gold require higher volume and on-time performance; repeated poor timeliness can produce `Restricted`. `MaatCreditPolicy` maps Bronze, Silver, and Gold to demo limits of `1,000`, `10,000`, and `50,000 USDC`.

The worker proposes proofs. It cannot directly settle invoices, write trust metrics, assign tiers, or set credit limits.

## Verified Live Flow

The complete flow has run against public testnets:

| Step | Transaction |
| --- | --- |
| Create invoice on Creditcoin | [`0xebbd...a4e2`](https://creditcoin-testnet.blockscout.com/tx/0xebbdcf04423ee914f43a33ea325e9161dfcda8e42bbf3cf4c64d71b2e25ca4e2) |
| Pay `1 USDC` on Sepolia | [`0xb8d0...f58e`](https://sepolia.etherscan.io/tx/0xb8d079f555b3caac2d74ade0fcefebbd384d57294ac9d318fc964ae1dde0f58e) |
| Verify and settle on Creditcoin | [`0x6431...c5b2`](https://creditcoin-testnet.blockscout.com/tx/0x643149722959cc293226e8ceab3d0e73881227c10aa9a69125c089c27d86c5b2) |

That proof settled the invoice on time, updated both counterparties, granted the payer Bronze tier and a `1,000 USDC` demo policy limit, and was rejected when replayed.

## Environment

| Component | Value |
| --- | --- |
| Settlement chain | Creditcoin Testnet, chain ID `102031` |
| Source chain | Ethereum Sepolia, Attestcoin chain key `1` |
| Source asset | Official Sepolia USDC, `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` |
| Block prover | `0x0000000000000000000000000000000000000FD2` |
| Proof generator | `https://proof-gen-api.cc3-testnet.creditcoin.network` |
| Contracts | Solidity `^0.8.28`, Hardhat, OpenZeppelin |
| Worker | TypeScript and Viem |
| Frontend | React, TanStack Start, Wagmi, Viem |

### Deployments

| Component | Network | Address |
| --- | --- | --- |
| `SettlementRouter` | Ethereum Sepolia | [`0xCf3D...2fAe`](https://sepolia.etherscan.io/address/0xCf3D8C3a3ADD06E8d4737f3AfF120e3257122fAe#code) |
| `InvoiceRegistry` | Creditcoin Testnet | [`0x3923...EF50`](https://creditcoin-testnet.blockscout.com/address/0x3923CF7230ca3144F323FC884b1eACaF5860EF50#code) |
| `MaatTrustRegistry` | Creditcoin Testnet | [`0xa6a3...821a`](https://creditcoin-testnet.blockscout.com/address/0xa6a3e5aa35571ff6f7e6F64Df3E457F56551821a#code) |
| `MaatSettlementVerifier` | Creditcoin Testnet | [`0x56e0...7e2d`](https://creditcoin-testnet.blockscout.com/address/0x56e06DD47711D8433D7160E28E6ad771a0fc7e2d#code) |
| `MaatCreditPolicy` | Creditcoin Testnet | [`0x6816...6dB5`](https://creditcoin-testnet.blockscout.com/address/0x68169737E733f2b1461BB699b1f3Be05202A6dB5#code) |

## Security Boundaries

The Creditcoin verifier, not the worker, is the correctness boundary. It enforces:

- the configured Attestcoin source chain;
- the immutable Sepolia router as both transaction destination and log emitter;
- a supported EVM transaction envelope and successful receipt;
- exactly one canonical payment event;
- exact payer, vendor, amount, and invoice matching;
- query-level and invoice-level replay protection;
- atomic invoice and trust updates.

The Sepolia router uses `SafeERC20`, `ReentrancyGuard`, `Pausable`, and two-step ownership. Its owner can pause new payments for incident response, but cannot forge a settlement fact accepted by Creditcoin.

## Constraints and Tradeoffs

These are known MVP constraints, not hidden assumptions:

- **Testnet only.** The contracts and policy have not been presented as audited or safe for production funds.
- **One source deployment.** The verifier is bound to Sepolia chain key `1` and one immutable router. Supporting more chains or router upgrades requires a new verifier or a governed source registry.
- **One proof per invoice.** Ma'at does not currently use Attestcoin batch verification. The MVP optimizes for active invoice settlement, not historical proof aggregation.
- **Exact full payments only.** Partial payments, overpayments, split payments, refunds, chargebacks, and disputes are out of scope.
- **Payment is not escrowed.** USDC transfers directly to the vendor. If the vendor cancels the Creditcoin invoice before its proof settles, Creditcoin will reject reconciliation but cannot reverse the completed Sepolia payment.
- **Attestation is asynchronous.** Settlement waits for the source block to be attested and for the proof API to respond. Ma'at does not claim an unmeasured fixed latency.
- **Decoder scope is explicit.** The current decoder supports the SDK envelope for EVM transaction types `0` through `4`; an upstream encoding change requires compatibility work.
- **Worker availability still matters.** The worker has Sepolia RPC fallback, adaptive scan ranges, retries, and a persistent cursor, but its processing queue is in memory and it has no durable dead-letter queue or alerting yet.
- **Some infrastructure is single-endpoint.** Creditcoin RPC and the proof generator are current availability dependencies even though they cannot bypass on-chain verification.
- **Policy is illustrative.** Tier thresholds and credit limits are deterministic demo parameters, not validated risk models.
- **An attested payment is not a legal judgment.** Ma'at does not verify identity, invoice legitimacy, goods delivery, sanctions status, or off-chain contractual disputes.
- **Metadata is a commitment.** Creditcoin stores `metadataHash`, not the full invoice document; durable document storage is a separate concern.

## Repository

```text
contracts/  Hardhat contracts, deployment scripts, tests, and CLI flows
worker/     proof polling, settlement validation, submission, and live watcher
web/        customer dashboard, invoice creation, payment, proof status, and receipts
docs/       MVP, Attestcoin integration, operations, testing, and pitch material
```

The contract suite currently has `43` passing tests. Contract scripts and the worker pass TypeScript checks, and the frontend passes lint and production build checks.

## Local Setup

Requirements:

- Node.js 22 or newer
- funded Ethereum Sepolia and Creditcoin Testnet accounts
- Sepolia and Creditcoin RPC endpoints

Create `.env` from `.env.example`. Keep private keys local and never expose them through frontend environment variables.

```bash
cd contracts
npm install
npm run check
npm test

cd ../worker
npm install
npm run check

cd ../web
npm install
npm run lint
npm run build
```

The CLI demo uses separate roles: `SEPOLIA_PRIVATE_KEY` is the buyer, `VENDOR_PRIVATE_KEY` creates the invoice and receives USDC, and `CREDITCOIN_PRIVATE_KEY` relays proofs. Invoice amount, buyer, due date, and metadata remain runtime values rather than environment constants.

For detailed deployment and operation steps, see:

- [MVP specification](docs/mvp-spec.md)
- [Attestcoin integration](docs/attestcoin-integration.md)
- [Worker operations](worker/README.md)
- [Web application](web/README.md)

## License

MIT
