# Attestcoin Protocol Integration

This document describes how Ma'at uses the Attestcoin Protocol to convert a verified Ethereum Sepolia USDC payment into invoice settlement, counterparty history, and machine-readable credit policy on Creditcoin Testnet.

## Implementation Status

The settlement integration is implemented, locally tested, deployed, and source-verified on Sepolia and Creditcoin Testnet. Its first real settlement proof remains pending. Historical live evidence from the execution-reputation prototype is retained at the end of this document because it validates the same proof transport, native verifier, transaction envelope, and replay design.

## Settlement Deployment

| Component | Network | Verified address |
| --- | --- | --- |
| `SettlementRouter` | Ethereum Sepolia | [`0xCf3D8C3a3ADD06E8d4737f3AfF120e3257122fAe`](https://sepolia.etherscan.io/address/0xCf3D8C3a3ADD06E8d4737f3AfF120e3257122fAe#code) |
| `InvoiceRegistry` | Creditcoin Testnet | [`0x934e10191833E4544e6E335b0Fa0459f01e26114`](https://creditcoin-testnet.blockscout.com/address/0x934e10191833E4544e6E335b0Fa0459f01e26114#code) |
| `MaatTrustRegistry` | Creditcoin Testnet | [`0x75A1Dc5ad3edCE91F8d796a2E860C0146603b4d6`](https://creditcoin-testnet.blockscout.com/address/0x75A1Dc5ad3edCE91F8d796a2E860C0146603b4d6#code) |
| `MaatSettlementVerifier` | Creditcoin Testnet | [`0x42F875971648A3584A24dAD58F784ebEb75F1147`](https://creditcoin-testnet.blockscout.com/address/0x42F875971648A3584A24dAD58F784ebEb75F1147#code) |
| `MaatCreditPolicy` | Creditcoin Testnet | [`0xB5eD84E5cA917Cb4Cda1FF600b78b9e57cab17cF`](https://creditcoin-testnet.blockscout.com/address/0xB5eD84E5cA917Cb4Cda1FF600b78b9e57cab17cF#code) |

## Verified Environment

| Setting | Value |
| --- | --- |
| Source chain | Ethereum Sepolia |
| Attestcoin source chain key | `1` |
| Source asset | Official Sepolia USDC |
| Sepolia USDC | `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` |
| Destination chain | Creditcoin Testnet |
| Creditcoin chain ID | `102031` |
| Creditcoin RPC | `https://rpc.cc3-testnet.creditcoin.network` |
| Proof API | `https://proof-gen-api.cc3-testnet.creditcoin.network` |
| Native query verifier | `0x0000000000000000000000000000000000000FD2` |
| Chain information precompile | `0x0000000000000000000000000000000000000fd3` |
| SDK package | `@gluwa/usc-sdk@0.18.0` |

Ma'at does not infer chain IDs, Attestcoin chain keys, precompile addresses, token addresses, or proof layouts. Deployment scripts fail if the live chain, configured source key, official token, token decimals, verifier call behavior, or deployed bindings do not match these explicit values. The verifier is a native precompile, so its runtime check uses a typed `calculateTxIndex` call rather than incorrectly requiring EVM bytecode from `eth_getCode`.

Primary references:

- https://docs.creditcoin.org/creditcoin-usc/usc-chains-environments
- https://docs.creditcoin.org/creditcoin-usc/guided-tutorials
- https://docs.creditcoin.org/creditcoin-usc/dapp-builder-infrastructure/usc-sdk
- https://proof-gen-api.cc3-testnet.creditcoin.network/api/swagger/
- https://proof-gen-api.cc3-testnet.creditcoin.network/api/swagger/openapi.json

## Source Evidence

`SettlementRouter` accepts only its immutable official Sepolia USDC token. It transfers the exact amount directly from buyer to vendor and then emits:

```solidity
event InvoicePaid(
    bytes32 indexed invoiceId,
    address indexed payer,
    address indexed vendor,
    uint256 amount,
    uint256 paidAt
);
```

The router does not escrow or bridge funds. The event binds a successful direct USDC transfer to the corresponding Creditcoin invoice.

## Proof Lifecycle

1. A vendor creates an exact invoice in `InvoiceRegistry` on Creditcoin Testnet.
2. The configured buyer calls `SettlementRouter.payInvoice` on Sepolia.
3. The worker reads the successful Sepolia receipt and confirms exactly one `InvoicePaid` log from the configured router.
4. The worker polls `GET /api/v1/attested-height/1` until Attestcoin has attested the payment block.
5. The worker requests `GET /api/v1/proof-by-tx/1/{txHash}`.
6. The worker simulates `MaatSettlementVerifier.submitVerifiedSettlement` on Creditcoin.
7. If simulation succeeds, the worker submits the same proof-only call and waits for a successful Creditcoin receipt.
8. The state verifier reads the settled invoice, payer metrics, vendor metrics, credit policy, and both replay markers directly from Creditcoin.

The worker decodes source fields for operator visibility, but it does not send invoice ID, payer, vendor, amount, or payment timestamp as trusted verifier arguments. The on-chain call contains only chain key, source height, encoded transaction, Merkle proof, and continuity proof.

## Attested Transaction Decoding

The proof API returns Attestcoin's encoded EVM transaction and receipt. The SDK layout is:

```solidity
abi.encode(uint8 transactionType, bytes[] chunks)
```

For transaction types 0, 1, and 2, the receipt is chunk `2`. For transaction types 3 and 4, the receipt is chunk `3`.

After native proof verification, `AttestedPaymentDecoder` requires:

- a supported transaction type from 0 through 4
- the configured `SettlementRouter` as both transaction destination and log emitter
- a successful source receipt
- the exact `InvoicePaid` event signature
- exactly four event topics and exactly 64 bytes of event data
- exactly one matching payment event in the source transaction

It derives invoice ID, payer, vendor, amount, and payment timestamp exclusively from the verified receipt topics and data.

## Creditcoin Verification

`MaatSettlementVerifier` is immutable-bound at deployment to:

- Attestcoin Sepolia source chain key `1`
- one deployed Sepolia `SettlementRouter`
- one `InvoiceRegistry`
- one `MaatTrustRegistry`

For each proof submission it:

1. rejects any source chain key other than `1`
2. asks the native verifier precompile to calculate the source transaction index
3. derives `queryKey = keccak256(abi.encodePacked(chainKey, height, txIndex))`
4. rejects an already processed source query
5. calls the native verifier with the transaction bytes, Merkle proof, and continuity proof
6. decodes the verified payment from the successful source receipt
7. asks `InvoiceRegistry` to reconcile the exact invoice, buyer, vendor, and amount
8. records whether settlement was on time in `MaatTrustRegistry`
9. commits the source-query and invoice replay markers atomically

Any reconciliation or trust update revert rolls back the entire transaction, including the query marker. A corrected Creditcoin invoice cannot reuse false source evidence, while valid source evidence is not consumed by a failed reconciliation.

## Business-State Effects

`InvoiceRegistry` marks one matching open invoice as `Settled` and stores the verified source payment timestamp. It rejects wrong buyers, vendors, amounts, cancelled invoices, and already settled invoices.

`MaatTrustRegistry` updates verified payer settlement count, on-time count, late count, total paid, last settlement time, and tier. It also updates vendor settled invoice count, total received, and last settlement time. A second invoice-level replay marker prevents a different source transaction from settling the same business obligation twice.

`MaatCreditPolicy` maps the resulting deterministic tier to a USDC-denominated credit limit. Attestcoin proves the source transaction; Ma'at's tier thresholds are application policy, not a claim that Attestcoin performs underwriting.

## Trust Boundary

The proof generator and worker are availability dependencies, not correctness authorities. A compromised worker cannot alter payment semantics accepted by Creditcoin because all business inputs come from transaction bytes accepted by the native verifier and decoded against immutable source bindings.

The MVP does not prove vendor fulfillment, legal invoice validity, business identity, or fiat settlement. It proves that the configured buyer transferred the exact official Sepolia USDC amount to the configured vendor through the deployed router and applies deterministic policy to that evidence.

## Local Verification

```bash
cd contracts
npm run check
npm test

cd ../worker
npm run check
```

The local suite installs mock verifier runtime bytecode at the production precompile address and verifies proof acceptance, atomic invoice/trust updates, credit-policy changes, wrong-chain rejection, failed-proof rejection, reconciliation rollback, and source-query replay rejection. This tests application integration behavior; it does not replace the required live native Attestcoin proof.

## Testnet Reproduction

Populate the public deployment values documented in `.env.example`. Invoice terms are runtime inputs rather than environment configuration:

```bash
cd contracts
npm run deploy:settlement:sepolia
npm run deploy:settlement:creditcoin
npm run invoice:create -- <buyer> <amount-usdc> <due-at-unix> <metadata-hash>
npm run invoice:pay -- <invoice-id> <vendor> <amount-usdc>

cd ../worker
npm run process-settlement -- <sepolia-payment-transaction-hash>
npm run verify-settlement -- <invoice-id> <chain-key> <height> <tx-index>
```

The Sepolia router must be deployed first because the Creditcoin verifier permanently binds that source address. The two Creditcoin registries initially authorize the deployer only so the deployment script can atomically hand authority to the final verifier; after handoff, the deployer can no longer write settlement or trust state.

## Historical Live Evidence

The legacy prototype used execution events rather than invoice payments, but successfully exercised the same live Attestcoin proof API and Creditcoin native verifier path.

Sepolia source transactions:

- https://sepolia.etherscan.io/tx/0x2d56bb39133bd59921c3ae7e165b77b45b8812f463667af319e8d39215ec75ba
- https://sepolia.etherscan.io/tx/0x971b56be7921a6c50d6552c1d686f440dbb43140d3771ed187d6e07cef48cba4
- https://sepolia.etherscan.io/tx/0x72bec9f8ec43c5b5cde2392201c4bfe449e4bbb00c2c3f8feb549e83310b584b

Creditcoin proof-submission transactions:

- https://creditcoin-testnet.blockscout.com/tx/0x37f94d8c5e148e110370215576a8d6a2b15dbe4ed6e41458a5c16c0e7880f42c
- https://creditcoin-testnet.blockscout.com/tx/0x880b5966ca86dff320b3c5ab59f746445e0b9710aab0b065b26c675c635e720f
- https://creditcoin-testnet.blockscout.com/tx/0xf0af72fd1878d5969f9baee2af1e0c421dddb134a310f02122b9b6f4a4cf5c85

These are not settlement-contract transactions and must not be presented as the final MVP evidence.

## Current Limitations

- The verifier accepts only Sepolia chain key `1` and one immutable router.
- A source transaction must contain exactly one matching payment event.
- One invoice requires one exact full payment; partial payments and refunds are unsupported.
- Attestation latency controls when a source payment can affect Creditcoin state.
- The watcher needs persistent cursor, retry, and dead-letter storage before production use.
- The deterministic credit limits are demo policy and have not been validated as production underwriting rules.
