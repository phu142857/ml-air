#!/usr/bin/env python3
"""Static check: Alertmanager tenant routes align with MLAir Prometheus rules (Wave 1)."""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ALERTS = ROOT / "deploy/monitoring/alerts/mlair-alerts.yml"
ROUTES = ROOT / "deploy/monitoring/alertmanager-tenant-routes.example.yml"


def _fail(msg: str) -> None:
    print(f"[FAIL] {msg}")


def _ok(msg: str) -> None:
    print(f"[OK] {msg}")


def check_tenant_alert_group() -> bool:
    if not ALERTS.is_file():
        _fail(f"missing {ALERTS.relative_to(ROOT)}")
        return False
    text = ALERTS.read_text(encoding="utf-8")
    if "mlair-lifecycle-semantic-tenant" not in text:
        _fail("mlair-alerts.yml missing group mlair-lifecycle-semantic-tenant")
        return False
    tenant_alerts = re.findall(r"alert:\s+(MlAirLifecycle\w+ByTenant)", text)
    if len(tenant_alerts) < 1:
        _fail("no *ByTenant alerts found in mlair-alerts.yml")
        return False
    _ok(f"tenant alert rules present ({len(tenant_alerts)}): {', '.join(tenant_alerts)}")
    return True


def check_route_skeleton() -> bool:
    if not ROUTES.is_file():
        _fail(f"missing {ROUTES.relative_to(ROOT)}")
        return False
    text = ROUTES.read_text(encoding="utf-8")
    required = (
        "MlAirLifecycle.*ByTenant",
        "tenant-lifecycle",
        'group_by: ["tenant_id", "alertname"]',
    )
    ok = True
    for fragment in required:
        if fragment not in text:
            _fail(f"alertmanager example missing: {fragment!r}")
            ok = False
    if ok:
        _ok("alertmanager tenant route skeleton present")
    return ok


def check_amtool_optional() -> bool:
    proc = subprocess.run(["bash", "-c", "command -v amtool"], capture_output=True, check=False)
    if proc.returncode != 0:
        _ok("amtool not installed — skip live Alertmanager config test")
        return True
    proc = subprocess.run(
        ["amtool", "check-config", str(ROUTES)],
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        _fail(f"amtool check-config failed:\n{proc.stdout}\n{proc.stderr}")
        return False
    _ok("amtool check-config passed on example routes")
    return True


def main() -> int:
    checks = [check_tenant_alert_group(), check_route_skeleton(), check_amtool_optional()]
    passed = sum(1 for c in checks if c)
    total = len(checks)
    print(f"\nTOTAL {total} PASS {passed} FAIL {total - passed}")
    return 0 if all(checks) else 1


if __name__ == "__main__":
    raise SystemExit(main())
