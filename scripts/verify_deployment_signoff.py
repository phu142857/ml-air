#!/usr/bin/env python3
"""Automated checks for Deployment sign-off (Package 005 Phase D3)."""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

DEPLOY_ARTIFACTS = (
    "deploy/docker-compose.allinone.yml",
    "deploy/docker-compose.quickstart.yml",
    "deploy/docker-compose.scheduler-ha.override.yml",
    "deploy/env/staging-strict.env.example",
    "deploy/env/production-strict.env.example",
    "deploy/monitoring/prometheus.yml",
    "deploy/monitoring/alerts/mlair-alerts.yml",
    "charts/ml-air/Chart.yaml",
    "charts/ml-air/templates/realtime.yaml",
    "charts/ml-air/values-staging-strict.yaml",
    "charts/ml-air/values-production.yaml",
    "charts/ml-air/values-production-strict.yaml",
    "deploy/monitoring/alertmanager-tenant-routes.example.yml",
    "docs/deployment/DESIGN-FREEZE.md",
)

SIGNOFF_SCRIPTS = (
    "scripts/verify_operator_signoff.py",
    "scripts/verify_execution_realtime.py",
    "scripts/sync_strict_lifecycle_l4.py",
    "scripts/chaos_wave1.sh",
    "scripts/validate_scheduler_ha.sh",
)


def _fail(msg: str) -> None:
    print(f"[FAIL] {msg}")


def _ok(msg: str) -> None:
    print(f"[OK] {msg}")


def check_deploy_artifacts() -> bool:
    missing = [p for p in DEPLOY_ARTIFACTS if not (ROOT / p).is_file()]
    if missing:
        _fail(f"missing deployment artifacts: {missing}")
        return False
    freeze = (ROOT / "docs/deployment/DESIGN-FREEZE.md").read_text(encoding="utf-8")
    if "CLOSED" not in freeze:
        _fail("deployment DESIGN-FREEZE not CLOSED")
        return False
    _ok("deployment artifacts + frozen DESIGN-FREEZE")
    return True


def check_signoff_scripts() -> bool:
    missing = [p for p in SIGNOFF_SCRIPTS if not (ROOT / p).is_file()]
    if missing:
        _fail(f"missing signoff scripts: {missing}")
        return False
    _ok("operator sign-off scripts present")
    return True


def check_allinone_supervisorctl_socket() -> bool:
    conf = (ROOT / "deploy/allinone/supervisord.conf").read_text(encoding="utf-8")
    for section in ("[unix_http_server]", "[supervisorctl]", "[rpcinterface:supervisor]"):
        if section not in conf:
            _fail(f"supervisord.conf missing {section} (chaos drill needs supervisorctl)")
            return False
    _ok("all-in-one supervisord socket configured")
    return True


def check_chaos_allinone_aware() -> bool:
    chaos = (ROOT / "scripts/chaos_wave1.sh").read_text(encoding="utf-8")
    if "is_allinone" not in chaos or "realtime_health_url" not in chaos:
        _fail("chaos_wave1.sh missing all-in-one health URL logic")
        return False
    _ok("chaos_wave1 all-in-one aware")
    return True


def run_env_sync() -> bool:
    proc = subprocess.run(
        [sys.executable, "scripts/check_env_sync.py"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        _fail(f"check_env_sync failed:\n{proc.stdout}\n{proc.stderr}")
        return False
    _ok("check_env_sync passed")
    return True


def run_prometheus_rules() -> bool:
    proc = subprocess.run(
        ["make", "test-prometheus-rules"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        _fail(f"test-prometheus-rules failed:\n{proc.stdout}\n{proc.stderr}")
        return False
    _ok("prometheus alert rules valid")
    return True


def run_alertmanager_routes() -> bool:
    proc = subprocess.run(
        [sys.executable, "scripts/verify_alertmanager_routes.py"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        _fail(f"verify_alertmanager_routes failed:\n{proc.stdout}\n{proc.stderr}")
        return False
    _ok("alertmanager tenant routes skeleton valid")
    return True


def run_helm_lint() -> bool:
    if subprocess.run(["bash", "-c", "command -v helm"], capture_output=True).returncode != 0:
        _ok("helm lint skipped (helm not installed)")
        return True
    proc = subprocess.run(
        ["helm", "lint", "charts/ml-air"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        _fail(f"helm lint failed:\n{proc.stdout}\n{proc.stderr}")
        return False
    _ok("helm lint passed")
    return True


def main() -> int:
    checks = [
        check_deploy_artifacts(),
        check_signoff_scripts(),
        check_allinone_supervisorctl_socket(),
        check_chaos_allinone_aware(),
        run_env_sync(),
        run_prometheus_rules(),
        run_alertmanager_routes(),
        run_helm_lint(),
    ]
    passed = sum(1 for c in checks if c)
    total = len(checks)
    print(f"\nTOTAL {total} PASS {passed} FAIL {total - passed}")
    return 0 if all(checks) else 1


if __name__ == "__main__":
    raise SystemExit(main())
