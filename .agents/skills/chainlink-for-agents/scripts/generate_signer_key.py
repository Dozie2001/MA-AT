#!/usr/bin/env python3
"""
Generate a new random EVM private key for use with Chainlink for Agents.

The private key never leaves your machine. Print JSON to stdout so you can
save the key securely and fund the address for USDC / gas as needed.

Dependencies: pip install eth-account

Usage:
    python scripts/generate_signer_key.py

Output (stdout, one JSON object):
    {"address": "0x...", "private_key": "0x..."}

Security:
    - Store the private key in a password manager or agent secret store — not in git.
    - Fund `address` with USDC for x402 only if you also use this key as the payment wallet.
    - A separate payment wallet may pay x402; agent identity still comes from EIP-191 signing.
    - Use this key only from trusted local or agent-managed secret storage.
"""

from __future__ import annotations

import json
import sys


def main() -> None:
    try:
        from eth_account import Account
    except ImportError:
        print("Error: install eth-account: pip install eth-account", file=sys.stderr)
        sys.exit(1)

    acct = Account.create()
    pk_hex = acct.key.hex() if hasattr(acct.key, "hex") else bytes(acct.key).hex()
    out = {
        "address": acct.address,
        "private_key": "0x" + pk_hex.removeprefix("0x"),
    }
    print(json.dumps(out, indent=2))
    print(
        "\nNext: verify the address and use this key only on your machine for EIP-191 "
        "request signing and eip712_sign.py. Fund it with USDC only if it will also be "
        "your x402 payment wallet.",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
