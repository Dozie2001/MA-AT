#!/usr/bin/env python3
"""
x402 payment client — makes HTTP requests to x402-protected APIs.

Handles the full x402 payment protocol:
  1. Makes the HTTP request
  2. On HTTP 402, parses payment requirements (PAYMENT-REQUIRED header or v1 body)
  3. Signs an EIP-712 TransferWithAuthorization for USDC (payment wallet)
  4. Retries with PAYMENT-SIGNATURE (v2) or X-PAYMENT (v1) header

Your private key never leaves this script.
x402 is payment-only. For protected Chainlink for Agents routes, pass EIP-191
X-Agent-* headers separately; the x402 payer does not authenticate the agent.

Dependencies (pip install):
    requests>=2.28
    eth-account>=0.8
    eth-abi>=4.0

Usage:
    python x402_payment.py --private-key 0x... --url "https://..." [--body '{}']
    python x402_payment.py --url "https://..." --body '{}' --max-amount-usdc 0.01
    (key from AGENT_PRIVATE_KEY or EVM_PRIVATE_KEY env var)

Output (JSON to stdout):
    {"status": 200, "paid": false, "data": {...}}
    {"status": 200, "paid": true, "payment_network": "base-sepolia", "payment_amount_usdc": 0.001, "data": {...}}
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import secrets
import sys
import time
from typing import Any

# ---------------------------------------------------------------------------
# x402 protocol constants
# ---------------------------------------------------------------------------

EVM_NETWORK_CHAIN_ID: dict[str, int] = {
    "ethereum": 1,
    "sepolia": 11155111,
    "base-sepolia": 84532,
    "base": 8453,
    "polygon": 137,
    "polygon-amoy": 80002,
    "avalanche-fuji": 43113,
    "avalanche": 43114,
    "abstract": 2741,
    "abstract-testnet": 11124,
    "iotex": 4689,
    "sei": 1329,
    "sei-testnet": 1328,
    "peaq": 3338,
    "story": 1514,
    "educhain": 41923,
    "megaeth": 4326,
    "monad": 143,
}

# EIP-712 types for TransferWithAuthorization (EIP-3009, used by USDC)
TRANSFER_WITH_AUTHORIZATION_TYPES = {
    "TransferWithAuthorization": [
        {"name": "from", "type": "address"},
        {"name": "to", "type": "address"},
        {"name": "value", "type": "uint256"},
        {"name": "validAfter", "type": "uint256"},
        {"name": "validBefore", "type": "uint256"},
        {"name": "nonce", "type": "bytes32"},
    ]
}

USDC_DECIMALS = 6


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _load_key(cli_key: str | None) -> str:
    raw = (
        cli_key
        or os.environ.get("AGENT_PRIVATE_KEY")
        or os.environ.get("EVM_PRIVATE_KEY")
    )
    if not raw or not raw.strip():
        print(
            "Error: private key required. Pass --private-key or set AGENT_PRIVATE_KEY env var.",
            file=sys.stderr,
        )
        sys.exit(1)
    raw = raw.strip()
    return raw if raw.startswith("0x") else f"0x{raw}"


def _b64encode(payload: Any) -> str:
    return base64.b64encode(json.dumps(payload).encode()).decode()


def _b64decode(value: str) -> Any:
    return json.loads(base64.b64decode(value).decode())


def _get_chain_id(network: str) -> int:
    if network.startswith("eip155:"):
        return int(network.split(":")[1])
    chain_id = EVM_NETWORK_CHAIN_ID.get(network)
    if chain_id is None:
        raise ValueError(f"Unknown network '{network}'. Add it to EVM_NETWORK_CHAIN_ID or use eip155:<id> format.")
    return chain_id


def _create_nonce_hex() -> str:
    """Random 32-byte hex nonce for TransferWithAuthorization."""
    return "0x" + secrets.token_hex(32)


def _payment_amount_raw(requirements: dict) -> str:
    amount = requirements.get("amount")
    if amount is None:
        amount = requirements.get("maxAmountRequired")
    if amount is None:
        amount = "0"
    return str(amount)


def _normalise_accepted_requirements(requirements: dict) -> dict:
    """
    Preserve the server challenge while filling fields the x402 exact EVM
    verifier expects to match by name.
    """
    accepted = dict(requirements)
    accepted.setdefault("scheme", "exact")
    if "amount" not in accepted and "maxAmountRequired" in accepted:
        accepted["amount"] = str(accepted["maxAmountRequired"])
    elif "amount" in accepted:
        accepted["amount"] = str(accepted["amount"])
    return accepted


# ---------------------------------------------------------------------------
# EIP-712 signing
# ---------------------------------------------------------------------------

def _sign_transfer_with_authorization(
    account: Any,
    requirements: dict,
    network: str,
) -> tuple[str, dict]:
    """
    Sign an EIP-3009 TransferWithAuthorization for x402 payment.

    Returns (signature_hex, authorization_dict).
    The authorization dict goes into the payment payload sent to the server.
    """
    try:
        from eth_account.messages import encode_typed_data
    except ImportError:
        print("Error: eth-account is required. Install with: pip install eth-account eth-abi", file=sys.stderr)
        sys.exit(1)

    chain_id = _get_chain_id(network)

    extra = requirements.get("extra") or {}
    token_name = extra.get("name")
    token_version = extra.get("version")
    if not token_name or not token_version:
        raise ValueError(
            f"Payment requirements missing extra.name/extra.version for EIP-712 domain "
            f"(asset={requirements.get('asset')})"
        )

    asset = requirements["asset"]
    pay_to = requirements["payTo"]
    amount_str = _payment_amount_raw(requirements)
    max_timeout = int(requirements.get("maxTimeoutSeconds", 300))

    nonce_hex = _create_nonce_hex()
    now = int(time.time())
    valid_after = now - 600  # 10 minutes leeway
    valid_before = now + max_timeout

    domain = {
        "name": token_name,
        "version": token_version,
        "chainId": chain_id,
        "verifyingContract": asset,
    }

    # eth_account needs bytes32 as Python bytes
    message = {
        "from": account.address,
        "to": pay_to,
        "value": int(amount_str),
        "validAfter": valid_after,
        "validBefore": valid_before,
        "nonce": bytes.fromhex(nonce_hex[2:]),
    }

    structured = {
        "domain": domain,
        "types": TRANSFER_WITH_AUTHORIZATION_TYPES,
        "primaryType": "TransferWithAuthorization",
        "message": message,
    }

    signable = encode_typed_data(full_message=structured)
    signed = account.sign_message(signable)
    sig_hex = signed.signature.hex()
    if not sig_hex.startswith("0x"):
        sig_hex = f"0x{sig_hex}"

    r_hex = f"0x{signed.r:064x}"
    s_hex = f"0x{signed.s:064x}"

    # Authorization dict for the payment payload (string values, hex nonce).
    # The x402 exact EVM scheme expects EIP-3009 signature parts inside this object.
    authorization = {
        "from": account.address,
        "to": pay_to,
        "value": amount_str,
        "validAfter": str(valid_after),
        "validBefore": str(valid_before),
        "nonce": nonce_hex,
        "v": signed.v,
        "r": r_hex,
        "s": s_hex,
    }

    return sig_hex, authorization


# ---------------------------------------------------------------------------
# Core x402 request logic
# ---------------------------------------------------------------------------

def x402_payment(
    account: Any,
    method: str,
    url: str,
    body: dict | None = None,
    extra_headers: dict | None = None,
    max_amount_usdc: float | None = None,
    raw_body: bytes | None = None,
) -> dict:
    """
    Make an HTTP request, automatically handling x402 payment on 402 responses.

    When *raw_body* is set for POST, the exact bytes are sent (Content-Type: application/json).
    Use this when the request body is covered by a hash in EIP-191 signing.

    Returns a dict with keys: status, paid, data, (and payment_* on paid responses).
    """
    try:
        import requests as req_lib
    except ImportError:
        print("Error: requests is required. Install with: pip install requests", file=sys.stderr)
        sys.exit(1)

    session = req_lib.Session()
    headers: dict[str, str] = {"Content-Type": "application/json"}
    if extra_headers:
        headers.update(extra_headers)

    method = method.upper()
    if raw_body is not None and method == "GET":
        raise ValueError("raw_body is not valid for GET requests")

    def _do_request(hdrs: dict) -> Any:
        if method == "GET":
            return session.get(url, headers=hdrs, timeout=120)
        if raw_body is not None:
            h = {**hdrs, "Content-Type": "application/json"}
            return session.post(url, data=raw_body, headers=h, timeout=120)
        return session.post(url, json=body or {}, headers=hdrs, timeout=120)

    # First attempt
    resp = _do_request(headers)

    if resp.status_code != 402:
        try:
            data = resp.json()
        except Exception:
            data = resp.text
        return {"status": resp.status_code, "paid": False, "data": data}

    # --- 402 received: parse payment requirements ---
    payment_required_hdr = (
        resp.headers.get("PAYMENT-REQUIRED")
        or resp.headers.get("payment-required")
    )

    if payment_required_hdr:
        payment_required = _b64decode(payment_required_hdr)
        x402_version = 2
        payment_header_name = "PAYMENT-SIGNATURE"
    else:
        # v1: body IS the payment requirements
        try:
            payment_required = resp.json()
        except Exception as exc:
            raise ValueError("402 response has neither PAYMENT-REQUIRED header nor JSON body") from exc
        if not isinstance(payment_required, dict) or payment_required.get("x402Version") != 1:
            raise ValueError("Unexpected 402 response format")
        x402_version = 1
        payment_header_name = "X-PAYMENT"

    # Find a supported payment option (exact scheme)
    accepts = payment_required.get("accepts")
    if accepts is None:
        # v1: payment_required IS the single option
        accepts = [payment_required]

    selected: dict | None = None
    for req in accepts:
        if req.get("scheme", "exact") == "exact":
            selected = req
            break

    if selected is None:
        raise ValueError(
            f"No 'exact' payment scheme found. Available: "
            f"{[r.get('scheme') for r in accepts]}"
        )

    # Amount guard
    amount_raw = _payment_amount_raw(selected)
    amount_usdc = int(amount_raw) / (10 ** USDC_DECIMALS)
    print(
        f"x402: payment required — {amount_usdc} USDC on {selected.get('network')} "
        f"→ {selected.get('payTo')}",
        file=sys.stderr,
    )

    if max_amount_usdc is not None and amount_usdc > max_amount_usdc:
        raise ValueError(
            f"Payment amount {amount_usdc} USDC exceeds --max-amount-usdc {max_amount_usdc}. "
            f"Refusing to sign."
        )

    # Sign
    network = selected["network"]
    signature, authorization = _sign_transfer_with_authorization(account, selected, network)

    payload_body = {
        "authorization": authorization,
        # Kept for compatibility with clients/facilitators that accept a combined
        # signature field; canonical exact EVM validation uses authorization.v/r/s.
        "signature": signature,
    }

    if x402_version == 2:
        accepted = _normalise_accepted_requirements(selected)
        accepted.setdefault("network", network)
        payment_payload = {
            "x402Version": 2,
            "accepted": accepted,
            "payload": payload_body,
        }
    else:
        payment_payload = {
            "x402Version": x402_version,
            "scheme": selected.get("scheme", "exact"),
            "network": network,
            "payload": payload_body,
        }

    payment_header_value = _b64encode(payment_payload)
    retry_headers = {**headers, payment_header_name: payment_header_value}

    print(f"x402: signed payment, retrying request with {payment_header_name}", file=sys.stderr)

    retry_resp = _do_request(retry_headers)

    try:
        data = retry_resp.json()
    except Exception:
        data = retry_resp.text

    return {
        "status": retry_resp.status_code,
        "paid": True,
        "payment_network": network,
        "payment_amount_usdc": amount_usdc,
        "payment_asset": selected.get("asset"),
        "payment_pay_to": selected.get("payTo"),
        "data": data,
    }


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Make an HTTP request to an x402-protected API, paying automatically."
    )
    parser.add_argument(
        "--private-key",
        metavar="KEY",
        default=None,
        help="Hex private key (0x...). Defaults to AGENT_PRIVATE_KEY or EVM_PRIVATE_KEY env var.",
    )
    parser.add_argument("--url", required=True, help="Full URL of the API endpoint")
    parser.add_argument(
        "--method", default="POST", choices=["GET", "POST", "get", "post"],
        help="HTTP method (default: POST)",
    )
    parser.add_argument(
        "--body", metavar="JSON", default="{}",
        help="JSON request body for POST requests (ignored if --raw-body is set)",
    )
    parser.add_argument(
        "--raw-body",
        metavar="STR",
        default=None,
        help="Exact UTF-8 POST body (e.g. compact JSON for EIP-191 hash). Use - to read stdin.",
    )
    parser.add_argument(
        "--headers", metavar="JSON", default="{}",
        help="Additional HTTP headers as a JSON object",
    )
    parser.add_argument(
        "--max-amount-usdc", type=float, default=None, metavar="FLOAT",
        help="Refuse to pay more than this amount in USDC (safety cap)",
    )
    args = parser.parse_args()

    private_key = _load_key(args.private_key)

    try:
        from eth_account import Account
    except ImportError:
        print("Error: eth-account is required. Install with: pip install eth-account eth-abi", file=sys.stderr)
        sys.exit(1)

    account = Account.from_key(private_key)
    print(f"x402: using wallet {account.address}", file=sys.stderr)

    raw_body: bytes | None = None
    if args.raw_body is not None:
        s = args.raw_body
        if s == "-":
            raw_body = sys.stdin.buffer.read()
        else:
            raw_body = s.encode("utf-8")
        body: dict = {}
    else:
        try:
            body = json.loads(args.body) if args.body else {}
        except json.JSONDecodeError as e:
            print(f"Error: --body is not valid JSON: {e}", file=sys.stderr)
            sys.exit(1)

    try:
        extra_headers = json.loads(args.headers) if args.headers else {}
    except json.JSONDecodeError as e:
        print(f"Error: --headers is not valid JSON: {e}", file=sys.stderr)
        sys.exit(1)

    try:
        result = x402_payment(
            account=account,
            method=args.method,
            url=args.url,
            body=body,
            extra_headers=extra_headers,
            max_amount_usdc=args.max_amount_usdc,
            raw_body=raw_body,
        )
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

    print(json.dumps(result, indent=2))

    if result["status"] >= 400:
        sys.exit(1)


if __name__ == "__main__":
    main()
