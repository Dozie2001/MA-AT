# Ma'at

**Settle an Ethereum invoice on Creditcoin. Turn the verified payment into business trust.**

Ma'at is a cross-chain B2B settlement and reputation protocol built for the Creditcoin Attestcoin hackathon. A vendor creates an invoice on Creditcoin, a buyer pays USDC on Ethereum, and Attestcoin proves the payment back to Creditcoin. One verified source-chain fact then settles the invoice, updates payer and vendor history, and changes machine-readable credit policy.

The practical use case is recurring cross-border supplier settlement. A distributor can pay overseas vendors directly in stablecoins, reconcile each payment against exact invoice terms, preserve an independently verifiable audit trail, and build payment history that treasury or financing systems can later consume. Ma'at turns a payment from a transaction hash into a reusable trade reference.

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

| Generic cross-chain gate               | Ma'at                                                                        |
| -------------------------------------- | ---------------------------------------------------------------------------- |
| Proves that a transaction was included | Proves inclusion and requires a successful source receipt                    |
| Trusts submitted business fields       | Derives invoice ID, payer, vendor, amount, and payment time from the receipt |
| Releases one action                    | Atomically settles the invoice and updates payer and vendor trust            |
| Checks whether something happened      | Checks whether the correct buyer paid the correct vendor the exact amount    |
| Treats time as backend metadata        | Compares the attested payment timestamp with the on-chain due date           |

Ma'at is also distinct from retrospective repayment-history underwriting. Its primary object is an active commercial invoice, its source event is the direct USDC settlement, and its decision is whether that exact obligation was fulfilled. For operational reconciliation and trust-history updates, Ma'at can verify `2..10` invoice payments together with one shared continuity proof while preserving exact per-invoice checks.

The dashboard preserves that history across protocol upgrades. It reads the active batch-enabled deployment and the retired v1 deployment, resolves historical invoice links as read-only records, and reports verified paid and received volume separately so buyer and vendor wallets are represented correctly. All new writes use only the active contracts.

## Attestcoin Integration

Attestcoin is load-bearing in the settlement path. The worker can discover a payment and propose its proof, but it cannot choose the facts credited to a payer or vendor.

| Mechanism                     | How Ma'at uses it                                                                                                     |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Own Attestcoin Smart Contract | `MaatSettlementVerifier` is the Creditcoin entry point for verified settlements.                                      |
| Own source event              | `InvoicePaid(bytes32,address,address,uint256,uint256)` is emitted only after the router transfers USDC to the vendor. |
| Block prover precompile       | The verifier calls Attestcoin at `0x0000000000000000000000000000000000000FD2`.                                        |
| Single and batch verification | `verify` checks one payment or up to 10 payments sharing one continuity proof.                                        |
| On-chain receipt decoding     | `AttestedPaymentDecoder` extracts the canonical event from the attested transaction envelope.                         |
| Source binding                | Immutable chain key `1` and immutable router address prevent proofs from an unexpected chain or contract.             |
| Success enforcement           | Receipt status must equal `1`; transaction inclusion alone is not accepted as payment.                                |
| Semantic matching             | Creditcoin requires the attested payer, vendor, amount, and invoice ID to match the open invoice exactly.             |
| Time verification             | `paidAt` comes from the source event and determines whether settlement was on time.                                   |
| Replay protection             | The verifier rejects a reused `(chainKey, height, txIndex)`, and the trust registry rejects a reused invoice ID.      |

### Proof Lifecycle

1. The worker scans the immutable Sepolia `SettlementRouter` for `InvoicePaid` logs.
2. It reads the corresponding Creditcoin invoice and rejects mismatched or closed invoices before requesting a proof.
3. It waits until Attestcoin's attested height covers the Sepolia payment block.
4. It requests `encodedTransaction`, a Merkle proof, and a continuity proof from the CC3 proof generator.
5. It simulates `submitVerifiedSettlement` on Creditcoin before sending the transaction.
6. The Creditcoin contract verifies and decodes the proof, then settles the invoice and updates trust in one atomic transaction.
7. If any proof, receipt, source, or invoice check fails, the entire Creditcoin transaction reverts.

For a batch, the worker sends `2..10` Sepolia transaction hashes to `POST /api/v1/proof-batch-by-tx/1`. `MaatSettlementVerifier.submitVerifiedSettlementBatch` verifies all encoded transactions in one overloaded precompile call and then applies every invoice and trust update atomically. One invalid, replayed, cancelled, or mismatched item rolls back the complete batch rather than creating a partial accounting history.

## On-Chain Trust

Every accepted settlement updates deterministic Creditcoin state:

- payer metrics: settled count, on-time count, late count, total USDC paid, latest settlement, and tier;
- vendor metrics: settled count, total USDC received, and latest settlement;
- policy output: whether the current tier permits a requested invoice amount.

The MVP tiers are transparent demonstration policy, not production underwriting. Bronze begins after one verified settlement; Silver and Gold require higher volume and on-time performance; repeated poor timeliness can produce `Restricted`. `MaatCreditPolicy` maps Bronze, Silver, and Gold to demo limits of `1,000`, `10,000`, and `50,000 USDC`.

The worker proposes proofs. It cannot directly settle invoices, write trust metrics, assign tiers, or set credit limits.

## Verified Live Flow

The complete flow has run against public testnets:

| Step                            | Transaction                                                                                                                        |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Create invoice on Creditcoin    | [`0xebbd...a4e2`](https://creditcoin-testnet.blockscout.com/tx/0xebbdcf04423ee914f43a33ea325e9161dfcda8e42bbf3cf4c64d71b2e25ca4e2) |
| Pay `1 USDC` on Sepolia         | [`0xb8d0...f58e`](https://sepolia.etherscan.io/tx/0xb8d079f555b3caac2d74ade0fcefebbd384d57294ac9d318fc964ae1dde0f58e)              |
| Verify and settle on Creditcoin | [`0x6431...c5b2`](https://creditcoin-testnet.blockscout.com/tx/0x643149722959cc293226e8ceab3d0e73881227c10aa9a69125c089c27d86c5b2) |

That proof settled the invoice on time, updated both counterparties, granted the payer Bronze tier and a `1,000 USDC` demo policy limit, and was rejected when replayed.

The transaction above proves the original single-settlement path. The current batch-enabled deployment has also completed a live two-invoice Attestcoin settlement:

| Batch evidence              | Value                                                                                                                              |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Sepolia payment 1           | [`0xce3d...99e7`](https://sepolia.etherscan.io/tx/0xce3d926cb99c69c21ed3c69ae6a59e318399e82e8c9c43fdd44557b461c699e7)              |
| Sepolia payment 2           | [`0x9b9c...b95b`](https://sepolia.etherscan.io/tx/0x9b9c7d17112a4c0c31793dc50797d7cfe1ab299379318fd98b905e31e885b95b)              |
| Shared continuity range     | `11538393..11538565`                                                                                                               |
| Creditcoin batch settlement | [`0x30e1...6b56`](https://creditcoin-testnet.blockscout.com/tx/0x30e1b646998d2bd5cd523048d7b65d60a83fa2f13974338dd07585c6755c6b56) |
| Result                      | Both invoices and both trust updates committed atomically                                                                          |

Across the current and legacy registries, the test buyer has six verified settlements and `4.02 USDC` paid; the corresponding vendor has six settlements and `4.02 USDC` received. These are testnet engineering results, not customer traction.

## Environment

| Component        | Value                                                               |
| ---------------- | ------------------------------------------------------------------- |
| Settlement chain | Creditcoin Testnet, chain ID `102031`                               |
| Source chain     | Ethereum Sepolia, Attestcoin chain key `1`                          |
| Source asset     | Official Sepolia USDC, `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` |
| Block prover     | `0x0000000000000000000000000000000000000FD2`                        |
| Proof generator  | `https://proof-gen-api.cc3-testnet.creditcoin.network`              |
| Contracts        | Solidity `^0.8.28`, Hardhat, OpenZeppelin                           |
| Worker           | TypeScript and Viem                                                 |
| Frontend         | React, TanStack Start, Wagmi, Viem                                  |

### Chain Scope

The working MVP verifies Ethereum Sepolia payments on Creditcoin CC3 Testnet. Attestcoin's published environment matrix currently lists Ethereum Mainnet for CC3 Mainnet and Ethereum Sepolia plus Ethereum Mainnet for CC3 Testnet. Ma'at does not currently support Solana or claim support for an EVM network that is absent from that matrix.

The architecture is EVM-expandable: for each newly supported source chain, Ma'at needs a deployed payment router, immutable or governed source binding, RPC and proof-worker configuration, frontend wallet/network support, and end-to-end decoder and security tests. Non-EVM expansion requires chain-specific source and decoding infrastructure in addition to official Attestcoin support.

[Official Attestcoin chain matrix](https://docs.creditcoin.org/attestcoin-protocol/attestcoin-protocol-chains-environments)

### Deployments

| Component                | Network            | Address                                                                                                              |
| ------------------------ | ------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `SettlementRouter`       | Ethereum Sepolia   | [`0xCf3D...2fAe`](https://sepolia.etherscan.io/address/0xCf3D8C3a3ADD06E8d4737f3AfF120e3257122fAe#code)              |
| `InvoiceRegistry`        | Creditcoin Testnet | [`0xACD9...1405`](https://creditcoin-testnet.blockscout.com/address/0xACD97e1980ba6E7E5eD142e1064E7929E43f1405#code) |
| `MaatTrustRegistry`      | Creditcoin Testnet | [`0x075B...BcA5`](https://creditcoin-testnet.blockscout.com/address/0x075B6a3c8526413856Bb9a418C37fbE1aBA1BcA5#code) |
| `MaatSettlementVerifier` | Creditcoin Testnet | [`0x99d4...6666`](https://creditcoin-testnet.blockscout.com/address/0x99d48BFA0a9713B9BDec032bd07785D010C8c666#code) |
| `MaatCreditPolicy`       | Creditcoin Testnet | [`0xd02F...F70D`](https://creditcoin-testnet.blockscout.com/address/0xd02F1f044B20551763eF815778B561969E3EF70D#code) |

The previous Creditcoin deployment remains an immutable historical record. The web application reads it for lifetime invoice and trust history but prevents new payment or cancellation actions against it.

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
- **Batch failure is atomic.** Batch verification accepts `2..10` payments, but one invalid or concurrently cancelled invoice reverts every item. The worker prevalidates the batch to reduce wasted proof generation and gas.
- **Exact full payments only.** Partial payments, overpayments, split payments, refunds, chargebacks, and disputes are out of scope.
- **Payment is not escrowed.** USDC transfers directly to the vendor. If the vendor cancels the Creditcoin invoice before its proof settles, Creditcoin will reject reconciliation but cannot reverse the completed Sepolia payment.
- **Attestation is asynchronous.** Settlement waits for the source block to be attested and for the proof API to respond. Ma'at does not claim an unmeasured fixed latency.
- **Decoder scope is explicit.** The current decoder supports the SDK envelope for EVM transaction types `0` through `4`; an upstream encoding change requires compatibility work.
- **Worker availability still matters.** The worker has Sepolia RPC fallback, adaptive scan ranges, retries, and a persistent cursor, but its processing queue is in memory and it has no durable dead-letter queue or alerting yet.
- **Some infrastructure is single-endpoint.** Creditcoin RPC and the proof generator are current availability dependencies even though they cannot bypass on-chain verification.
- **Policy is illustrative.** Tier thresholds and credit limits are deterministic demo parameters, not validated risk models.
- **An attested payment is not a legal judgment.** Ma'at does not verify identity, invoice legitimacy, goods delivery, sanctions status, or off-chain contractual disputes.
- **Metadata is a commitment.** Creditcoin stores `metadataHash`, not the full invoice document; durable document storage is a separate concern.

## Roadmap

The roadmap is EVM-first and gated by verified Attestcoin support rather than assumed chain availability.

1. **Pilot readiness:** durable settlement queue and dead-letter storage, monitoring and alerting, role-based treasury approvals, partial payments, refunds, disputes, and business identity/document integrations.
2. **Production corridor:** independent security review, validated risk rules, Ethereum and Creditcoin mainnet deployment, operational controls, and pilot counterparties.
3. **Additional EVM sources:** deploy chain-specific routers and complete proof, decoder, RPC, wallet, and security validation as Attestcoin adds official source-chain support.
4. **Trade-finance layer:** supplier-finance integrations, treasury API/SDK, configurable policy modules, and agent-readable spending and counterparty controls.
5. **Non-EVM evaluation:** consider Solana or other ecosystems only after official Attestcoin support exists and Ma'at implements the required chain-specific adapter and decoder.

Roadmap items are product intent, not completed functionality, guaranteed dates, or claims of partnerships.

## Repository

```text
contracts/  Hardhat contracts, deployment scripts, tests, and CLI flows
worker/     proof polling, settlement validation, submission, and live watcher
web/        customer dashboard, invoice creation, payment, proof status, and receipts
docs/       MVP, Attestcoin integration, operations, testing, and pitch material
```

The contract suite currently has `46` passing tests, including batch success, rollback, sizing, and duplicate-query cases. The worker has `21` passing tests. Contract scripts and the worker pass TypeScript checks, and the frontend passes lint and production build checks.

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
npm test

cd ../web
npm install
npm run lint
npm run build
```

The CLI demo uses separate roles: `SEPOLIA_PRIVATE_KEY` is the buyer, `VENDOR_PRIVATE_KEY` creates the invoice and receives USDC, and `CREDITCOIN_PRIVATE_KEY` relays proofs. Invoice amount, buyer, due date, and metadata remain runtime values rather than environment constants.

After creating and paying between two and ten invoices against a batch-enabled deployment:

```bash
cd worker
npm run process-settlement-batch -- <sepolia-tx-1> <sepolia-tx-2> [...]
```

For detailed deployment and operation steps, see:

- [MVP specification](docs/mvp-spec.md)
- [Attestcoin integration](docs/attestcoin-integration.md)
- [Worker operations](worker/README.md)
- [Web application](web/README.md)

## License

MIT
