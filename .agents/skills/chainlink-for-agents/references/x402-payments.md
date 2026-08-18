# x402 Payment Reference

Makes HTTP requests to APIs protected by the [x402 payment protocol](https://x402.org). When a route returns HTTP 402, the script signs the returned EIP-3009 USDC payment challenge locally and retries the request.

x402 is payment only. For Chainlink for Agents protected routes, agent identity always comes from EIP-191 `X-Agent-*` headers. The x402 payer may differ from the registered agent signer, and paying x402 never authenticates or registers an agent.

Your private key stays local and is never sent to any server.

## Prerequisites

Python 3.9+ with `requests`, `eth-account`, and `eth-abi`:

```bash
pip install requests eth-account eth-abi
```

The script is at `scripts/x402_payment.py`. Run it from the `chainlink-for-agents/` skill root.

Your payment wallet must hold USDC on the target payment network. It can be the same wallet used for EIP-191 request signing, but that is not required.

## Usage

```bash
cd chainlink-for-agents
export AGENT_PRIVATE_KEY="0x..."
python scripts/x402_payment.py \
  --url "$CHAINLINK_AGENTS_URL/v1/catalog/some-paid-endpoint" \
  --method GET \
  --max-amount-usdc 1.0
```

## Arguments

| Argument | Default | Description |
|----------|---------|-------------|
| `--private-key KEY` | env | Hex private key. Also reads `AGENT_PRIVATE_KEY` or `EVM_PRIVATE_KEY`. |
| `--url URL` | required | Full URL of the API endpoint. |
| `--method METHOD` | `POST` | HTTP method: `GET` or `POST`. |
| `--body JSON` | `{}` | JSON request body for POST requests. |
| `--headers JSON` | `{}` | Additional headers as a JSON object. |
| `--max-amount-usdc FLOAT` | no limit | Safety cap: refuse to pay more than this amount in USDC. |

## Output

```json
{
  "status": 200,
  "paid": true,
  "payment_network": "base",
  "payment_amount_usdc": 0.001,
  "data": { }
}
```

If HTTP 402 is received but payment fails, the script exits with a non-zero status and prints error details to stderr.

## How x402 Works

1. The client makes the HTTP request normally.
2. The server responds with HTTP 402 and payment requirements.
3. The client selects an `exact` payment option from the challenge.
4. The client signs an EIP-3009 `TransferWithAuthorization` message for USDC locally.
5. The client retries the request with a payment authorization header.
6. The payment facilitator verifies and settles the payment.
7. The API continues processing only if any route-specific requirements, such as EIP-191 agent authentication and ToS checks, also pass.

No on-chain transaction is broadcast by the client.

When calling a protected paid route, include the EIP-191 `X-Agent-*` headers in the original request and the retried paid request. The helper preserves any headers passed through `--headers`; it does not generate EIP-191 headers for you.

## EIP-3009 Challenge Payload

For x402 v2 responses, `scripts/x402_payment.py` reads the `PAYMENT-REQUIRED` header and retries with `PAYMENT-SIGNATURE`. The retry header is base64-encoded JSON shaped like this:

```json
{
  "x402Version": 2,
  "accepted": {
    "scheme": "exact",
    "network": "eip155:8453",
    "asset": "0x...",
    "amount": "100000",
    "payTo": "0x..."
  },
  "payload": {
    "authorization": {
      "from": "0x...",
      "to": "0x...",
      "value": "100000",
      "validAfter": "1713700000",
      "validBefore": "1713700600",
      "nonce": "0x...",
      "v": 27,
      "r": "0x...",
      "s": "0x..."
    },
    "signature": "0x..."
  }
}
```

The `accepted` object is copied from the server challenge and normalized only to include `amount` when the challenge used `maxAmountRequired`. Do not rebuild or trim it manually: gateways may reject otherwise-valid signatures with errors such as `No matching payment requirements` when the `accepted` requirements do not match the challenge.

## Common USDC Networks

| Network | Chain ID | USDC Address |
|---------|----------|--------------|
| base-sepolia | 84532 | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| base | 8453 | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| sepolia | 11155111 | `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` |

The helper supports additional named networks. If the server returns an unlisted EVM network, use `eip155:<chain_id>` format when adapting the helper.

## Security

- The private key is passed as a CLI argument or environment variable and is never sent over the network.
- The script verifies the payment amount against `--max-amount-usdc` before signing.
- Prefer the environment variable form to avoid shell history exposure:

```bash
export AGENT_PRIVATE_KEY=0x...
cd chainlink-for-agents
python scripts/x402_payment.py --url "..." --body "..."
```
