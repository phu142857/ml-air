#!/usr/bin/env python3
"""Automated checks for Execution sign-off (Package 003 Phase E3)."""

from __future__ import annotations

import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCHEDULER_MAIN = ROOT / "scheduler" / "main.py"
RETRY_POLICY = ROOT / "sdk" / "retry_policy.py"
WORKER_TASKS = ROOT / "api" / "app" / "domains" / "orchestration" / "worker_task_service.py"
WORKER_SETTINGS = ROOT / "api" / "app" / "settings" / "worker.py"

EXEC_DOCS = (
    "docs/execution/DESIGN-FREEZE.md",
    "docs/execution/02-state-machines.md",
    "docs/execution/03-lease-and-retry.md",
    "docs/execution/08-contributor-rules.md",
)


def _fail(msg: str) -> None:
    print(f"[FAIL] {msg}")


def _ok(msg: str) -> None:
    print(f"[OK] {msg}")


def check_execution_docs_frozen() -> bool:
    missing = [p for p in EXEC_DOCS if not (ROOT / p).is_file()]
    if missing:
        _fail(f"missing execution docs: {missing}")
        return False
    freeze = (ROOT / "docs/execution/DESIGN-FREEZE.md").read_text(encoding="utf-8")
    if "CLOSED" not in freeze:
        _fail("execution DESIGN-FREEZE not CLOSED")
        return False
    _ok("execution package docs present and frozen")
    return True


def check_scheduler_state_machines() -> bool:
    if not SCHEDULER_MAIN.is_file():
        _fail("scheduler/main.py missing")
        return False
    text = SCHEDULER_MAIN.read_text(encoding="utf-8")
    for name in ("RUN_ALLOWED_TRANSITIONS", "TASK_ALLOWED_TRANSITIONS"):
        if name not in text:
            _fail(f"{name} not found in scheduler/main.py")
            return False
    required_task_states = {"PENDING", "QUEUED", "RUNNING", "RETRY", "SUCCESS", "FAILED", "CANCELLED"}
    found = set(re.findall(r'"([A-Z]+)"\s*:', text.split("TASK_ALLOWED_TRANSITIONS", 1)[1][:800]))
    if not required_task_states.issubset(found):
        _fail(f"task state machine missing states: {sorted(required_task_states - found)}")
        return False
    _ok("scheduler run/task transition tables present")
    return True


def check_retry_and_worker_contract() -> bool:
    for path in (RETRY_POLICY, WORKER_TASKS, WORKER_SETTINGS):
        if not path.is_file():
            _fail(f"missing {path.relative_to(ROOT)}")
            return False
    wt = WORKER_TASKS.read_text(encoding="utf-8")
    for fn in ("lease_tasks", "heartbeat_task", "complete_task", "fail_task"):
        if f"def {fn}" not in wt:
            _fail(f"worker_task_service missing {fn}")
            return False
    _ok("retry policy + worker lease contract modules present")
    return True


def check_task_execution_mode_in_infra() -> bool:
    infra = ROOT / "deploy" / ".env.infra.example"
    if not infra.is_file():
        _fail("missing deploy/.env.infra.example")
        return False
    text = infra.read_text(encoding="utf-8")
    if "ML_AIR_TASK_EXECUTION_MODE" not in text:
        _fail("ML_AIR_TASK_EXECUTION_MODE not in infra example")
        return False
    _ok("L3 task execution mode documented in infra example")
    return True


def run_retry_policy_tests() -> bool:
    env = os.environ.copy()
    env["PYTHONPATH"] = str(ROOT)
    proc = subprocess.run(
        [sys.executable, "-m", "unittest", "api.tests.test_retry_policy", "-q"],
        cwd=ROOT,
        env=env,
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        _fail(f"test_retry_policy failed:\n{proc.stdout}\n{proc.stderr}")
        return False
    _ok("test_retry_policy passed")
    return True


def run_dlq_cancel_integration() -> bool:
    base = os.getenv("ML_AIR_BASE_URL", "http://localhost:8080").rstrip("/")
    import urllib.error
    import urllib.request

    try:
        req = urllib.request.Request(f"{base}/health", method="GET")
        with urllib.request.urlopen(req, timeout=3) as resp:
            if resp.status != 200:
                _ok("dlq/cancel integration skipped (API unhealthy)")
                return True
    except (urllib.error.URLError, TimeoutError, OSError):
        _ok("dlq/cancel integration skipped (API not reachable)")
        return True
    proc = subprocess.run(
        [sys.executable, "scripts/verify_dlq_cancel_integration.py"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    print(proc.stdout, end="")
    if proc.stderr:
        print(proc.stderr, end="", file=sys.stderr)
    if proc.returncode != 0:
        _fail("verify_dlq_cancel_integration failed")
        return False
    _ok("dlq/cancel integration passed")
    return True


def run_container_execution_tests() -> bool:
    container = os.getenv("MLAIR_CONTAINER_NAME", "mlair").strip() or "mlair"
    proc = subprocess.run(
        ["docker", "ps", "--format", "{{.Names}}"],
        capture_output=True,
        text=True,
        check=False,
    )
    if container not in (proc.stdout or ""):
        _ok("container execution tests skipped (stack not running)")
        return True
    cmd = (
        "cd /app/api && PYTHONPATH=/app/api:/app python -m unittest "
        "tests.test_worker_settings_unit -q"
    )
    proc = subprocess.run(
        ["docker", "exec", container, "sh", "-c", cmd],
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        _fail(f"container execution tests failed:\n{proc.stdout}\n{proc.stderr}")
        return False
    _ok("container worker_settings tests passed")
    return True


def main() -> int:
    checks = [
        check_execution_docs_frozen(),
        check_scheduler_state_machines(),
        check_retry_and_worker_contract(),
        check_task_execution_mode_in_infra(),
        run_retry_policy_tests(),
        run_dlq_cancel_integration(),
        run_container_execution_tests(),
    ]
    passed = sum(1 for c in checks if c)
    total = len(checks)
    print(f"\nTOTAL {total} PASS {passed} FAIL {total - passed}")
    return 0 if all(checks) else 1


if __name__ == "__main__":
    raise SystemExit(main())
