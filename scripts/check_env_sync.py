#!/usr/bin/env python3
from __future__ import annotations

import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ENV_EXAMPLE = ROOT / ".env.example"
COMPOSE = ROOT / "deploy" / "docker-compose.quickstart.yml"

# Match ${VAR} or ${VAR:-default}
ENV_REF_RE = re.compile(r"\$\{([A-Z0-9_]+)(?::-[^}]*)?\}")
KEY_RE = re.compile(r"^([A-Z0-9_]+)\s*=", re.MULTILINE)


def parse_env_keys(path: Path) -> set[str]:
    text = path.read_text(encoding="utf-8")
    return set(KEY_RE.findall(text))


def parse_compose_refs(path: Path) -> set[str]:
    text = path.read_text(encoding="utf-8")
    return set(ENV_REF_RE.findall(text))


def main() -> int:
    if not ENV_EXAMPLE.exists():
        print("[FAIL] Missing .env.example")
        return 1
    if not COMPOSE.exists():
        print("[FAIL] Missing deploy/docker-compose.quickstart.yml")
        return 1

    env_keys = parse_env_keys(ENV_EXAMPLE)
    compose_refs = parse_compose_refs(COMPOSE)
    missing = sorted(k for k in compose_refs if k not in env_keys)

    if missing:
        print("[FAIL] Missing keys in .env.example:")
        for k in missing:
            print(f"  - {k}")
        print("Please add new env vars to both .env and .env.example immediately.")
        return 1

    print(f"[OK] Env sync check passed ({len(compose_refs)} refs, {len(env_keys)} example keys)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
