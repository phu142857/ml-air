#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import sys


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Validate managed manifest key rotation policy file.")
    p.add_argument(
        "--file",
        default=os.getenv("ML_AIR_MANIFEST_MANAGED_KEYS_FILE", "deploy/security/manifest-keys.sample.json"),
        help="Path to managed manifest keys JSON",
    )
    p.add_argument("--algorithm", default="hmac-sha256", choices=["hmac-sha256", "ed25519"])
    return p.parse_args()


def _load_json(path: str) -> dict:
    with open(path, encoding="utf-8") as f:
        parsed = json.load(f)
    if not isinstance(parsed, dict):
        raise ValueError("top-level JSON must be an object")
    return parsed


def _non_empty_map(blob: dict, key: str) -> dict[str, str]:
    raw = blob.get(key, {})
    if not isinstance(raw, dict):
        return {}
    out: dict[str, str] = {}
    for k, v in raw.items():
        ks = str(k).strip()
        vs = str(v).strip()
        if vs.startswith("env:"):
            env_name = vs[4:].strip()
            vs = os.getenv(env_name, "").strip()
        if ks and vs:
            out[ks] = vs
    return out


def main() -> int:
    args = _parse_args()
    try:
        blob = _load_json(args.file)
    except Exception as exc:  # noqa: BLE001
        print(f"[FAIL] cannot read key file: {exc}")
        return 1

    active = str(blob.get("active_key_id", "")).strip()
    allowed = blob.get("allowed_key_ids", [])
    if not isinstance(allowed, list):
        print("[FAIL] allowed_key_ids must be a list")
        return 1
    allowed_ids = {str(x).strip() for x in allowed if str(x).strip()}
    hmac_keys = _non_empty_map(blob, "hmac_keys")
    ed_priv = _non_empty_map(blob, "ed25519_private_keys")
    ed_pub = _non_empty_map(blob, "ed25519_public_keys")

    errors: list[str] = []
    warns: list[str] = []

    if not active:
        errors.append("missing active_key_id")
    if len(allowed_ids) < 2:
        warns.append("allowed_key_ids has less than 2 entries; no overlap window for rotation")
    if active and allowed_ids and active not in allowed_ids:
        errors.append("active_key_id is not in allowed_key_ids")

    if args.algorithm == "hmac-sha256":
        if not hmac_keys:
            errors.append("hmac_keys is empty")
        if active and active not in hmac_keys:
            errors.append("active_key_id missing in hmac_keys")
        missing_allowed = sorted(k for k in allowed_ids if k not in hmac_keys)
        if missing_allowed:
            warns.append(f"allowed key ids without hmac_keys material: {missing_allowed}")
    else:
        if not ed_pub:
            errors.append("ed25519_public_keys is empty")
        if active and active not in ed_pub:
            errors.append("active_key_id missing in ed25519_public_keys")
        if active and active not in ed_priv:
            errors.append("active_key_id missing in ed25519_private_keys")
        missing_allowed_pub = sorted(k for k in allowed_ids if k not in ed_pub)
        if missing_allowed_pub:
            warns.append(f"allowed key ids without ed25519 public key: {missing_allowed_pub}")

    for w in warns:
        print(f"[WARN] {w}")
    if errors:
        for e in errors:
            print(f"[FAIL] {e}")
        return 1

    print(
        json.dumps(
            {
                "status": "ok",
                "file": args.file,
                "algorithm": args.algorithm,
                "active_key_id": active,
                "allowed_key_ids": sorted(allowed_ids),
            }
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
