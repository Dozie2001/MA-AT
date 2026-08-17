#!/usr/bin/env python3
"""
Sign a Chainlink for Agents POST /v1/register request body using EIP-191.

Prefer sign_request.py for custom request bodies; this helper builds
{"tos_signature": "..."} for the common registration flow.

Dependencies: pip install eth-account

Set AGENT_PRIVATE_KEY or pass --private-key.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path


def main() -> None:
    p = argparse.ArgumentParser(description="Sign Chainlink for Agents registration request (EIP-191)")
    p.add_argument(
        "--private-key",
        default=None,
        help="Hex private key. Defaults to AGENT_PRIVATE_KEY or EVM_SIGNER_KEY env var.",
    )
    p.add_argument(
        "--tos-signature",
        required=True,
        help="EIP-712 ToS signature hex string",
    )
    args = p.parse_args()
    raw_key = args.private_key or os.environ.get("AGENT_PRIVATE_KEY") or os.environ.get("EVM_SIGNER_KEY")
    if not raw_key or not raw_key.strip():
        print(
            "Error: private key required. Pass --private-key or set AGENT_PRIVATE_KEY env var.",
            file=sys.stderr,
        )
        sys.exit(1)
    body = json.dumps({"tos_signature": args.tos_signature.strip()})
    script = Path(__file__).resolve().parent / "sign_request.py"
    cmd = [
        sys.executable,
        str(script),
        "--private-key",
        raw_key.strip(),
        "--method",
        "POST",
        "--path",
        "/v1/register",
        "--body",
        body,
    ]
    raise SystemExit(subprocess.call(cmd))


if __name__ == "__main__":
    main()
