#!/usr/bin/env python3
"""
EIP-712 signer for Chainlink for Agents operation data.

Reads EIP-712 typed data returned by Chainlink for Agents and signs it locally
using your own private key.

Dependencies (pip install):
    eth-account>=0.8
    eth-abi>=4.0

Usage:
    python eip712_sign.py --private-key 0x... --typed-data '<json>'
    python eip712_sign.py --typed-data -  # read from stdin; key from env
    python eip712_sign.py --typed-data '<full operation response>'  # auto-unwraps eip712 field

Output (JSON to stdout):
    {"signer_address": "0x...", "signature": "0x..."}
"""

from __future__ import annotations

import argparse
import json
import os
import sys


def _load_key(cli_key: str | None) -> str:
    raw = (
        cli_key
        or os.environ.get("AGENT_PRIVATE_KEY")
        or os.environ.get("EVM_SIGNER_KEY")
    )
    if not raw or not raw.strip():
        print(
            "Error: private key required. Pass --private-key or set AGENT_PRIVATE_KEY env var.",
            file=sys.stderr,
        )
        sys.exit(1)
    raw = raw.strip()
    return raw if raw.startswith("0x") else f"0x{raw}"


def _parse_typed_data(raw_json: str) -> dict:
    """Parse and normalise the EIP-712 typed data.

    Accepts:
    - The raw `eip712` object: {"domain":..., "types":..., "primaryType":..., "message":...}
    - A full operation response: {"eip712": {...}, "wallet_operation_id": ..., ...}
    """
    try:
        parsed = json.loads(raw_json)
    except json.JSONDecodeError as e:
        print(f"Error: typed-data is not valid JSON: {e}", file=sys.stderr)
        sys.exit(1)

    if not isinstance(parsed, dict):
        print("Error: typed-data must be a JSON object.", file=sys.stderr)
        sys.exit(1)

    # Unwrap full operation responses if needed.
    if "eip712" in parsed and isinstance(parsed["eip712"], dict):
        parsed = parsed["eip712"]

    for field in ("domain", "types", "primaryType", "message"):
        if field not in parsed:
            print(f"Error: typed-data missing required field '{field}'.", file=sys.stderr)
            sys.exit(1)

    return parsed


def _normalise_domain(domain: dict) -> dict:
    """Ensure chainId is an int (eth_account requires it)."""
    d = dict(domain)
    if "chainId" in d:
        d["chainId"] = int(d["chainId"])
    return d


def _coerce_uint256_field(name: str, raw: object) -> int:
    """Parse EIP-712 uint256 message fields (decimal or 0x hex string, or int)."""
    if raw is None:
        raise ValueError(f"message.{name} is required")
    if isinstance(raw, bool):
        raise TypeError(f"message.{name}: bool is not a valid uint256")
    if isinstance(raw, int):
        if raw < 0:
            raise ValueError(f"message.{name}: negative integer")
        return raw
    s = str(raw).strip()
    if not s:
        raise ValueError(f"message.{name} is empty")
    return int(s, 0)


def _normalise_message(message: dict) -> dict:
    """Convert id, deadline, and transaction values to the types eth_account needs."""
    msg = dict(message)
    if "id" in msg:
        msg["id"] = _coerce_uint256_field("id", msg["id"])
    if "deadline" in msg:
        msg["deadline"] = _coerce_uint256_field("deadline", msg["deadline"])
    if "transactions" in msg:
        txs = []
        for i, tx in enumerate(msg["transactions"]):
            t = dict(tx)
            if "value" in t:
                try:
                    t["value"] = _coerce_uint256_field(f"transactions[{i}].value", t["value"])
                except (TypeError, ValueError) as e:
                    raise ValueError(str(e)) from e
            else:
                t["value"] = 0
            data = t.get("data", "0x")
            if not isinstance(data, str):
                data = "0x" + bytes(data).hex() if data else "0x"
            if not data.startswith("0x"):
                data = f"0x{data}"
            t["data"] = bytes.fromhex(data[2:])
            txs.append(t)
        msg["transactions"] = txs
    return msg


def sign(private_key: str, typed_data: dict) -> tuple[str, str]:
    """Sign EIP-712 typed data. Returns (signer_address, signature_hex)."""
    try:
        from eth_account import Account
        from eth_account.messages import encode_typed_data
    except ImportError:
        print(
            "Error: eth-account is required. Install with: pip install eth-account eth-abi",
            file=sys.stderr,
        )
        sys.exit(1)

    domain = _normalise_domain(typed_data["domain"])
    message = _normalise_message(typed_data["message"])
    types = typed_data["types"]
    primary_type = typed_data["primaryType"]

    # eth_account encode_typed_data accepts the full structured data dict
    structured = {
        "domain": domain,
        "types": types,
        "primaryType": primary_type,
        "message": message,
    }

    signable = encode_typed_data(full_message=structured)
    account = Account.from_key(private_key)
    signed = account.sign_message(signable)
    return account.address, signed.signature.hex()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Sign Chainlink for Agents EIP-712 typed data locally."
    )
    parser.add_argument(
        "--private-key",
        metavar="KEY",
        default=None,
        help="Hex private key (0x...). Defaults to AGENT_PRIVATE_KEY or EVM_SIGNER_KEY env var.",
    )
    parser.add_argument(
        "--typed-data",
        metavar="JSON",
        required=True,
        help="EIP-712 JSON string or '-' to read from stdin.",
    )
    args = parser.parse_args()

    private_key = _load_key(args.private_key)

    if args.typed_data == "-":
        raw_json = sys.stdin.read()
    else:
        raw_json = args.typed_data

    typed_data = _parse_typed_data(raw_json)
    signer_address, signature = sign(private_key, typed_data)

    if not signature.startswith("0x"):
        signature = f"0x{signature}"

    print(json.dumps({"signer_address": signer_address, "signature": signature}))


if __name__ == "__main__":
    main()
