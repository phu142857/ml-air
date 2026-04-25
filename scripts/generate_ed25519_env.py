#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def _escape_pem(pem: str) -> str:
    return pem.replace("\n", "\\n")


def _set_env_value(text: str, key: str, value: str) -> str:
    line = f"{key}={value}"
    marker = f"{key}="
    lines = text.splitlines()
    for i, raw in enumerate(lines):
        if raw.startswith(marker):
            lines[i] = line
            return "\n".join(lines) + ("\n" if text.endswith("\n") else "")
    out = text
    if out and not out.endswith("\n"):
        out += "\n"
    out += line + "\n"
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate Ed25519 keypair env snippets for MLAir manifest signing.")
    parser.add_argument("--kid", default="v1", help="Key id to generate (default: v1)")
    parser.add_argument(
        "--algorithm",
        default="ed25519",
        choices=["ed25519"],
        help="Manifest signing algorithm for output snippet",
    )
    parser.add_argument(
        "--write-env",
        action="store_true",
        help="Write generated values directly into .env",
    )
    parser.add_argument(
        "--env-path",
        default=".env",
        help="Path to env file when --write-env is used (default: .env)",
    )
    args = parser.parse_args()

    try:
        from cryptography.hazmat.primitives import serialization
        from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
    except Exception as exc:  # noqa: BLE001
        print(f"[FAIL] cryptography dependency missing: {exc}")
        print("Install with: pip install cryptography")
        return 1

    private_key = Ed25519PrivateKey.generate()
    public_key = private_key.public_key()

    priv_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode("utf-8")
    pub_pem = public_key.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode("utf-8")

    kid = args.kid.strip() or "v1"
    priv_json = json.dumps({kid: _escape_pem(priv_pem)}, separators=(",", ":"))
    pub_json = json.dumps({kid: _escape_pem(pub_pem)}, separators=(",", ":"))

    print("# Add these lines to .env (or export before compose up)")
    print(f"ML_AIR_MANIFEST_SIGNING_ALGORITHM={args.algorithm}")
    print(f"ML_AIR_MANIFEST_ACTIVE_KEY_ID={kid}")
    print(f"ML_AIR_MANIFEST_ED25519_PRIVATE_KEYS_JSON={priv_json}")
    print(f"ML_AIR_MANIFEST_ED25519_PUBLIC_KEYS_JSON={pub_json}")
    print()
    print("# Optional single-key vars (not required when *_KEYS_JSON is used):")
    print(f"ML_AIR_MANIFEST_ED25519_PRIVATE_KEY={_escape_pem(priv_pem)}")
    print(f"ML_AIR_MANIFEST_ED25519_PUBLIC_KEY={_escape_pem(pub_pem)}")
    print()
    print("# Safety: keep private key secret, do not commit into git.")
    if args.write_env:
        env_path = Path(args.env_path)
        if not env_path.is_absolute():
            env_path = Path.cwd() / env_path
        original = env_path.read_text(encoding="utf-8") if env_path.exists() else ""
        updated = original
        updated = _set_env_value(updated, "ML_AIR_MANIFEST_SIGNING_ALGORITHM", args.algorithm)
        updated = _set_env_value(updated, "ML_AIR_MANIFEST_ACTIVE_KEY_ID", kid)
        updated = _set_env_value(updated, "ML_AIR_MANIFEST_ED25519_PRIVATE_KEYS_JSON", priv_json)
        updated = _set_env_value(updated, "ML_AIR_MANIFEST_ED25519_PUBLIC_KEYS_JSON", pub_json)
        # Clear single-key fields to avoid confusion.
        updated = _set_env_value(updated, "ML_AIR_MANIFEST_ED25519_PRIVATE_KEY", "")
        updated = _set_env_value(updated, "ML_AIR_MANIFEST_ED25519_PUBLIC_KEY", "")
        env_path.write_text(updated, encoding="utf-8")
        print(f"[OK] Updated env file: {env_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
