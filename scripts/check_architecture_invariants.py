#!/usr/bin/env python3
"""Architecture governance checks (Phase 4 Epic 6).

Scans the API codebase for common invariant violations:
- Application services writing directly to domain_audit_events / projected_* tables
- Domain event subscribers that publish business Domain Events
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
API_ROOT = REPO_ROOT / "api" / "app"

# Paths allowed to write audit / projection tables.
AUDIT_WRITE_ALLOWLIST = {
    "domains/audit/",
    "domains/projections/",
}

PROJECTION_TABLE_PATTERN = re.compile(r"\bprojected_[a-z_]+\b")
AUDIT_TABLE_PATTERN = re.compile(r"\bdomain_audit_events\b")
PUBLISH_PATTERN = re.compile(r"\.publish(_all)?\s*\(")


def _rel(path: Path) -> str:
    try:
        return str(path.relative_to(API_ROOT)).replace("\\", "/")
    except ValueError:
        return str(path)


def _is_allowed_audit_writer(rel: str) -> bool:
    return any(rel.startswith(prefix) for prefix in AUDIT_WRITE_ALLOWLIST)


def _is_subscriber(rel: str) -> bool:
    return rel.endswith("_subscriber.py") or rel.endswith("_event_handler.py")


def scan_file(path: Path) -> list[str]:
    rel = _rel(path)
    if "domains/shared/events/" in rel and "test" in rel:
        return []
    text = path.read_text(encoding="utf-8", errors="ignore")
    violations: list[str] = []

    if AUDIT_TABLE_PATTERN.search(text) and "INSERT INTO domain_audit_events" in text:
        if not _is_allowed_audit_writer(rel):
            violations.append(f"{rel}: direct INSERT into domain_audit_events")

    if PROJECTION_TABLE_PATTERN.search(text) and "INSERT INTO projected_" in text:
        if "domains/projections/" not in rel:
            violations.append(f"{rel}: direct INSERT into projection tables")

    if _is_subscriber(rel) and PUBLISH_PATTERN.search(text):
        if "get_event_bus" in text or "publish_all" in text or ".publish(" in text:
            # Allow comments only — crude but effective for CI guard.
            for i, line in enumerate(text.splitlines(), start=1):
                stripped = line.strip()
                if stripped.startswith("#"):
                    continue
                if ".publish(" in stripped or ".publish_all(" in stripped:
                    violations.append(f"{rel}:{i}: subscriber may publish Domain Events")
                    break

    return violations


def main() -> int:
    violations: list[str] = []
    for path in sorted(API_ROOT.rglob("*.py")):
        if path.name.startswith("test_"):
            continue
        violations.extend(scan_file(path))

    if violations:
        print("Architecture invariant violations:")
        for v in violations:
            print(f"  - {v}")
        return 1
    print("Architecture invariants OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
