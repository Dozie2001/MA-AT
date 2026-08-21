# Ma'at Settlement Worker

The worker backfills canonical `SettlementRouter.InvoicePaid` events from the
verified Sepolia deployment block, validates each payment against the current
Creditcoin invoice, waits for Attestcoin coverage, and submits the proof to
Creditcoin.

## Production behavior

- Scans from block `11,508,491` or an atomically persisted cursor.
- Uses 10-block `eth_getLogs` ranges by default, matching the verified limit of
  the configured Alchemy free-tier endpoint.
- Reduces an oversized range automatically when an RPC rejects it.
- Processes different invoices concurrently and serializes duplicate payments
  for the same invoice.
- Skips missing, settled, cancelled, or mismatched invoices before requesting a
  proof.
- Retries transient RPC, proof API, simulation, and submission failures.
- Advances the cursor only after every payment in a scanned range reaches a
  terminal outcome.

Run exactly one worker replica. Creditcoin replay protection remains the final
correctness boundary, but multiple replicas would waste RPC calls and race the
same proof submission.

## Commands

```bash
npm run check
npm test
npm run build
npm start
```

Read-only preflight for a known range:

```bash
npm run watch-settlements -- \
  --once \
  --dry-run \
  --from-block 11508787 \
  --to-block 11508787
```

Manual recovery remains available when a payment transaction hash is known:

```bash
npm run process-settlement -- 0x<sepolia-payment-transaction>
```

## Required secrets and configuration

Set these in the worker service, never in frontend `VITE_*` variables:

```text
SEPOLIA_RPC_URL
SEPOLIA_FALLBACK_RPC_URL_1
SEPOLIA_FALLBACK_RPC_URL_2
CREDITCOIN_RPC_URL
CREDITCOIN_PRIVATE_KEY
ATTESTCOIN_PROOF_API_URL
ATTESTCOIN_CHAIN_KEY_SEPOLIA
CREDITCOIN_CHAIN_ID
SETTLEMENT_ROUTER_ADDRESS
INVOICE_REGISTRY_ADDRESS
MAAT_SETTLEMENT_VERIFIER_ADDRESS
```

Recommended hosted settings:

```text
SETTLEMENT_CURSOR_FILE=/data/settlement-cursor.json
SETTLEMENT_ROUTER_DEPLOYMENT_BLOCK=11508491
SETTLEMENT_SCAN_CHUNK_SIZE=10
SETTLEMENT_SCAN_INTERVAL_MS=1000
SETTLEMENT_POLL_INTERVAL_MS=15000
SETTLEMENT_RETRY_INTERVAL_MS=30000
SETTLEMENT_RETRY_MAX_INTERVAL_MS=300000
```

Mount a persistent volume at `/data`. If the volume is unavailable, the worker
remains safe but repeats the bounded historical backfill after a restart.

The signing wallet should be dedicated to this testnet worker and funded only
with the tCTC needed for proof-submission gas.
