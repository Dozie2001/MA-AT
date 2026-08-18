# EIP-712 Signing Reference

Signs Chainlink for Agents operation data locally. Your private key never leaves your machine.

## Prerequisites

Python 3.9+ with `eth-account` and `eth-abi`:

```bash
pip install eth-account eth-abi
```

The script is at `scripts/eip712_sign.py`. Run it from the `chainlink-for-agents/` skill root.

## Usage

Pass your private key and the EIP-712 JSON from `GET https://agents.chain.link/v1/operations/{id}` or the `202` response from `POST /v1/operations/{workflowName}`. The script auto-unwraps a nested `eip712` field when present.

```bash
cd chainlink-for-agents
export AGENT_PRIVATE_KEY="0x..."
python scripts/eip712_sign.py \
  --typed-data '<eip712 JSON string>'
```

Pipe a saved operation-status JSON directly:

```bash
curl -sS \
  -H "X-Agent-Address: ..." \
  -H "X-Agent-Signature: ..." \
  -H "X-Agent-Timestamp: ..." \
  "$CHAINLINK_AGENTS_URL/v1/operations/$OP_ID" \
  | python scripts/eip712_sign.py --typed-data -
```

## Arguments

| Argument | Description |
|----------|-------------|
| `--private-key KEY` | Hex private key with or without `0x` prefix. Also reads `AGENT_PRIVATE_KEY` or `EVM_SIGNER_KEY`. |
| `--typed-data JSON` | EIP-712 JSON string, or `-` to read from stdin. |

## Output

```json
{
  "signer_address": "0x...",
  "signature": "0x..."
}
```

Use `signature` in `POST https://agents.chain.link/v1/operations/{id}/submit` with body `{ "signature": "<hex>" }` only. Chainlink for Agents already has the operation details from the workflow result.

## Full Submit Flow

```bash
SIG=$(
  python scripts/eip712_sign.py --typed-data "$EIP712_JSON" \
    | jq -r .signature
)
BODY=$(printf '{"signature":"%s"}' "$SIG")
SIGJSON=$(
  python scripts/sign_request.py \
    --method POST \
    --path "/v1/operations/$OP_ID/submit" \
    --body "$BODY"
)

curl -sS -X POST "$CHAINLINK_AGENTS_URL/v1/operations/$OP_ID/submit" \
  -H "Content-Type: application/json" \
  -H "X-Agent-Address: $(jq -r '.["X-Agent-Address"]' <<<"$SIGJSON")" \
  -H "X-Agent-Signature: $(jq -r '.["X-Agent-Signature"]' <<<"$SIGJSON")" \
  -H "X-Agent-Timestamp: $(jq -r '.["X-Agent-Timestamp"]' <<<"$SIGJSON")" \
  -H "PAYMENT-SIGNATURE: $PAYMENT_HEADER" \
  -d "$BODY"
```

## What to Sign

Sign the top-level `eip712` object returned by Chainlink for Agents. Do not invent or modify typed data. Use the same EVM key you use for registration and `X-Agent-*` request headers unless your integration has been configured differently.

## Security

- The private key is passed as a CLI argument or environment variable and is never sent over the network.
- The script has no network calls; it only performs local cryptographic operations.
- Prefer the environment variable form to avoid shell history exposure:

```bash
export AGENT_PRIVATE_KEY=0x...
cd chainlink-for-agents
python scripts/eip712_sign.py --typed-data "$EIP712_JSON"
```
