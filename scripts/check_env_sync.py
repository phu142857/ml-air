#!/usr/bin/env python3
"""Keep compose env refs aligned with env example files (Package 002 Phase 3)."""

from __future__ import annotations

import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ENV_CONTRACT = ROOT / ".env.example"
ENV_INFRA_EXAMPLE = ROOT / "deploy" / ".env.infra.example"
COMPOSE_FILES = (
    ROOT / "deploy" / "docker-compose.quickstart.yml",
    ROOT / "deploy" / "docker-compose.allinone.yml",
)

# Target cap for L3 contract file (groups A–E + frontend wiring).
CONTRACT_MAX_KEYS = 30

# Exact keys that must not appear in `.env.example`.
CONTRACT_EXCLUDED_KEYS = frozenset(
    {
        "ML_AIR_FEATURE_IDENTITY_LOGIN",
        "ML_AIR_LOGIN_LOCKOUT_THRESHOLD",
        "ML_AIR_LOGIN_LOCKOUT_MINUTES",
        "ML_AIR_LEGACY_STATIC_TOKENS",
        "ML_AIR_RUN_DB_INTEGRATION_TESTS",
    }
)

# Prefixes excluded from `.env.example` (infra / L1 / L4 / CLI).
CONTRACT_EXCLUDED_PREFIXES = (
    "ML_AIR_FEATURE_",
    "ML_AIR_LOGIN_LOCKOUT_",
    "OTEL_SERVICE_NAME_",
)

# Match ${VAR} or ${VAR:-default}
ENV_REF_RE = re.compile(r"\$\{([A-Z0-9_]+)(?::-[^}]*)?\}")
KEY_RE = re.compile(r"^([A-Z0-9_]+)\s*=", re.MULTILINE)


def parse_env_keys(path: Path) -> set[str]:
    text = path.read_text(encoding="utf-8")
    return set(KEY_RE.findall(text))


def parse_compose_refs(path: Path) -> set[str]:
    text = path.read_text(encoding="utf-8")
    return set(ENV_REF_RE.findall(text))


def _is_contract_excluded(key: str) -> bool:
    if key in CONTRACT_EXCLUDED_KEYS:
        return True
    return any(key.startswith(prefix) for prefix in CONTRACT_EXCLUDED_PREFIXES)


def main() -> int:
    if not ENV_CONTRACT.exists():
        print("[FAIL] Missing .env.example")
        return 1
    if not ENV_INFRA_EXAMPLE.exists():
        print("[FAIL] Missing deploy/.env.infra.example")
        return 1

    contract_keys = parse_env_keys(ENV_CONTRACT)
    infra_keys = parse_env_keys(ENV_INFRA_EXAMPLE)
    all_example_keys = contract_keys | infra_keys

    excluded_present = sorted(k for k in contract_keys if _is_contract_excluded(k))
    if excluded_present:
        print("[FAIL] Keys excluded from deployment contract present in .env.example:")
        for k in excluded_present:
            print(f"  - {k}")
        print("See docs/config/07-deployment-contract.md")
        return 1

    if len(contract_keys) > CONTRACT_MAX_KEYS:
        print(
            f"[FAIL] .env.example has {len(contract_keys)} keys (cap {CONTRACT_MAX_KEYS}). "
            "Move infra/tuning to deploy/.env.infra.example"
        )
        return 1

    overlap = sorted(contract_keys & infra_keys)
    if overlap:
        print("[FAIL] Keys duplicated in .env.example and deploy/.env.infra.example:")
        for k in overlap:
            print(f"  - {k}")
        return 1

    compose_refs: set[str] = set()
    for compose in COMPOSE_FILES:
        if not compose.exists():
            print(f"[FAIL] Missing {compose.relative_to(ROOT)}")
            return 1
        compose_refs |= parse_compose_refs(compose)

    missing = sorted(k for k in compose_refs if k not in all_example_keys)
    if missing:
        print("[FAIL] Missing keys in env examples (referenced by compose):")
        for k in missing:
            print(f"  - {k}")
        print("Add to .env.example (L3) or deploy/.env.infra.example (infra/legacy)")
        return 1

    print(
        f"[OK] Env sync check passed ({len(compose_refs)} compose refs, "
        f"{len(contract_keys)} contract keys, {len(infra_keys)} infra keys)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
