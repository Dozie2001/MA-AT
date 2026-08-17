#!/usr/bin/env python3
"""
Build EIP-191 personal_sign headers for Chainlink for Agents REST calls.

Canonical message (UTF-8):
  <METHOD> <path[?raw_query]>\n<unix_seconds>
  [\n0x<hex(sha256(body))>]   # third line only when body is non-empty

Sign with Ethereum personal_sign (EIP-191) via eth-account.

Dependencies: pip install eth-account

Examples:
  export AGENT_PRIVATE_KEY=0x...

  python scripts/sign_request.py --method POST \
    --path /v1/register --body '{"tos_signature":"0x..."}'

  python scripts/sign_request.py --method GET \
    --path '/v1/streams/reports/latest?feedID=0x...'

Output JSON (stdout):
  X-Agent-Address, X-Agent-Signature, X-Agent-Timestamp, canonical_message
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import time
from typing import Optional


def build_canonical_message(method: str, path: str, unix_ts: int, body: Optional[bytes]) -> str:
    method = method.strip().upper()
    path = path.strip()
    msg = f"{method} {path}\n{unix_ts}"
    if body:
        digest = hashlib.sha256(body).hexdigest()
        msg += f"\n0x{digest}"
    return msg


def main() -> None:
    p = argparse.ArgumentParser(description="Sign Chainlink for Agents HTTP requests (EIP-191)")
    p.add_argument(
        "--private-key",
        default=None,
        help="Hex private key (with or without 0x). Defaults to AGENT_PRIVATE_KEY or EVM_SIGNER_KEY env var.",
    )
    p.add_argument("--method", required=True, help="HTTP method, e.g. POST")
    p.add_argument("--path", required=True, help="URL path starting with /, including raw query when present")
    p.add_argument(
        "--timestamp",
        type=int,
        default=None,
        help="Unix seconds (default: now)",
    )
    p.add_argument(
        "--body",
        default=None,
        help='Raw JSON string for request body, or "-" to read stdin',
    )
    args = p.parse_args()

    try:
        from eth_account import Account
        from eth_account.messages import encode_defunct
    except ImportError:
        print("Error: install eth-account: pip install eth-account", file=sys.stderr)
        sys.exit(1)

    raw_key = args.private_key or os.environ.get("AGENT_PRIVATE_KEY") or os.environ.get("EVM_SIGNER_KEY")
    if not raw_key or not raw_key.strip():
        print(
            "Error: private key required. Pass --private-key or set AGENT_PRIVATE_KEY env var.",
            file=sys.stderr,
        )
        sys.exit(1)
    raw_key = raw_key.strip()
    if not raw_key.startswith("0x"):
        raw_key = "0x" + raw_key
    acct = Account.from_key(raw_key)

    ts = int(args.timestamp if args.timestamp is not None else time.time())
    body_bytes: Optional[bytes] = None
    if args.body:
        if args.body.strip() == "-":
            body_bytes = sys.stdin.buffer.read()
        else:
            body_bytes = args.body.encode("utf-8")

    canonical = build_canonical_message(args.method, args.path, ts, body_bytes)
    msg = encode_defunct(text=canonical)
    signed = acct.sign_message(msg)
    sig_hex = "0x" + signed.signature.hex()

    out = {
        "X-Agent-Address": acct.address,
        "X-Agent-Signature": sig_hex,
        "X-Agent-Timestamp": str(ts),
        "canonical_message": canonical,
    }
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
