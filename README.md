# Ma'at

Ma'at is being refactored into a cross-chain B2B settlement and trust protocol on Creditcoin.

A vendor creates an invoice on Creditcoin, a buyer pays USDC through Ma'at on Ethereum Sepolia, and Attestcoin proves that payment back to Creditcoin. The verified payment settles the invoice, updates counterparty history, and changes machine-readable credit policy.

## Why Attestcoin Matters

The worker is not trusted to assign settlement or trust inputs. It submits only the Attestcoin proof. The Creditcoin verifier must derive invoice ID, payer, vendor, amount, and payment time from the verified Sepolia receipt.

```text
Sepolia SettlementRouter
          |
          | InvoicePaid event
          v
Attestcoin proof generator
          |
          | tx bytes + Merkle proof + continuity proof
          v
Creditcoin SettlementVerifier -> InvoiceRegistry -> TrustRegistry -> CreditPolicy
```

## Current Status

The settlement contracts are deployed and source-verified on Sepolia and Creditcoin Testnet. The contract suite has 43 passing tests, and both the contract scripts and worker pass TypeScript checks. Creating and paying the first invoice and submitting its real Attestcoin proof are next.

Settlement deployment:

| Component | Network | Address |
| --- | --- | --- |
| `SettlementRouter` | Ethereum Sepolia | [`0xCf3D...2fAe`](https://sepolia.etherscan.io/address/0xCf3D8C3a3ADD06E8d4737f3AfF120e3257122fAe#code) |
| `InvoiceRegistry` | Creditcoin Testnet | [`0x934e...6114`](https://creditcoin-testnet.blockscout.com/address/0x934e10191833E4544e6E335b0Fa0459f01e26114#code) |
| `MaatTrustRegistry` | Creditcoin Testnet | [`0x75A1...b4d6`](https://creditcoin-testnet.blockscout.com/address/0x75A1Dc5ad3edCE91F8d796a2E860C0146603b4d6#code) |
| `MaatSettlementVerifier` | Creditcoin Testnet | [`0x42F8...1147`](https://creditcoin-testnet.blockscout.com/address/0x42F875971648A3584A24dAD58F784ebEb75F1147#code) |
| `MaatCreditPolicy` | Creditcoin Testnet | [`0xB5eD...17cF`](https://creditcoin-testnet.blockscout.com/address/0xB5eD84E5cA917Cb4Cda1FF600b78b9e57cab17cF#code) |

The existing legacy prototype has already proven the difficult Attestcoin foundation: proof polling, proof submission, native precompile verification, semantic receipt decoding, immutable source binding, and replay protection. Its latest deployment currently contains two verified execution proofs and remains tier `None`; it is not the final settlement deployment.

Legacy prototype addresses:

| Component | Network | Address |
| --- | --- | --- |
| `ExecutionReporter` | Ethereum Sepolia | `0xE6AEbf33F10111536665464215a4bfa6C6847177` |
| `MaatCore` | Creditcoin Testnet | `0xbeE9439aEFB1fFAD3F5E0E27bEeCE785bE403E49` |
| `MaatVerifier` | Creditcoin Testnet | `0xf85c06A681DDc363ff647Ad0e7B077bd5a817606` |
| `MaatPolicy` | Creditcoin Testnet | `0x79d1990488Ce4e275223269D2D6E061192b6269C` |

Do not use these addresses as the final B2B settlement contracts.

## Setup

Requirements:

- Node.js 22 or newer
- funded Ethereum Sepolia and Creditcoin Testnet accounts
- Sepolia and Creditcoin RPC endpoints

The CLI end-to-end demo uses distinct roles: `SEPOLIA_PRIVATE_KEY` is the buyer, `VENDOR_PRIVATE_KEY` creates the invoice and receives USDC, and `CREDITCOIN_PRIVATE_KEY` deploys contracts and relays proofs. Invoice terms remain runtime arguments, not environment variables.

Create `.env` from `.env.example`, then install and test both workspaces:

```bash
cd contracts
npm install
npm run check
npm test

cd ../worker
npm install
npm run check
```

Deploy and run the settlement flow after populating the public values in `.env`:

```bash
cd contracts
npm run deploy:settlement:sepolia
# Set SETTLEMENT_ROUTER_ADDRESS to the verified output.
npm run deploy:settlement:creditcoin
# Set the four Creditcoin contract addresses from the verified output.
npm run invoice:create -- <buyer> <amount-usdc> <due-at-unix> <metadata-hash>
npm run invoice:pay -- <invoice-id> <vendor> <amount-usdc>

cd ../worker
npm run process-settlement -- <sepolia-payment-transaction-hash>
npm run verify-settlement -- <invoice-id> <chain-key> <height> <tx-index>
```

For continuous event processing:

```bash
cd worker
npm run watch-settlements
```

## Contracts

- `ExecutionReporter`, `MaatVerifier`, `MaatCore`, and `MaatPolicy` are the proven legacy prototype.
- `SettlementRouter`, `InvoiceRegistry`, `MaatSettlementVerifier`, `MaatTrustRegistry`, and `MaatCreditPolicy` are the implemented settlement MVP components.

## Documentation

- [MVP specification](docs/mvp-spec.md)
- [Attestcoin integration](docs/attestcoin-integration.md)

## Current Limitations

- the live settlement Attestcoin proof has not yet been completed
- the configured payer currently needs Sepolia USDC and a distinct vendor account
- the watcher does not persist its cursor or retry queue across restarts
- no dashboard exists yet

## License

MIT
