#!/usr/bin/env python3
"""Automated checks for MLAir lifecycle contract docs and artifacts."""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

PHASE9_DOCS = (
    "docs/concepts/lifecycle-formal-model.md",
    "docs/concepts/lifecycle-event-flow.md",
    "docs/concepts/lifecycle-state-machines.md",
    "docs/api/realtime-event-envelope.md",
    "docs/api/readiness-and-gating.md",
    "docs/guides/semantic-observability-gaps.md",
)

PHASE9_ARTIFACTS = (
    "sdk/schemas/mlair-semantic-event-v1.schema.json",
    "api/app/schemas/mlair-semantic-event-v1.schema.json",
    "sdk/fixtures/sample-semantic-event-v1.json",
    "api/app/domains/observability/semantic_observability_model.py",
    "scripts/check_semantic_observability_coverage.py",
    "scripts/validate_semantic_event.py",
)

UNIT_TESTS_HOST = (
    "api.tests.test_semantic_event_type_schema_parity",
    "api.tests.test_semantic_observability_model",
)

UNIT_TESTS_CONTAINER = (
    "tests.test_lifecycle_invariants",
    "tests.test_semantic_event_contract",
)


def _fail(msg: str) -> None:
    print(f"[FAIL] {msg}")


def _ok(msg: str) -> None:
    print(f"[OK] {msg}")


def check_docs_and_artifacts() -> bool:
    missing = [p for p in (*PHASE9_DOCS, *PHASE9_ARTIFACTS) if not (ROOT / p).is_file()]
    if missing:
        _fail(f"missing lifecycle contract docs/artifacts: {missing}")
        return False
    _ok("lifecycle contract docs + artifacts present")
    return True


def run_host_unit_tests() -> bool:
    env = os.environ.copy()
    env["PYTHONPATH"] = f"{ROOT / 'api'}{os.pathsep}{ROOT}"
    modules = list(UNIT_TESTS_HOST)
    try:
        import fastapi  # noqa: F401

        modules.append("api.tests.test_lifecycle_invariants")
    except ImportError:
        pass
    proc = subprocess.run(
        [sys.executable, "-m", "unittest", *modules, "-q"],
        cwd=ROOT,
        env=env,
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        _fail(f"Phase 9 host unit tests failed:\n{proc.stdout}\n{proc.stderr}")
        return False
    _ok("Phase 9 host unit tests passed")
    return True


def run_observability_coverage() -> bool:
    env = os.environ.copy()
    env["PYTHONPATH"] = f"{ROOT / 'api'}{os.pathsep}{ROOT}"
    proc = subprocess.run(
        [sys.executable, "scripts/check_semantic_observability_coverage.py"],
        cwd=ROOT,
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        _fail(f"semantic observability coverage failed:\n{proc.stdout}\n{proc.stderr}")
        return False
    _ok(proc.stdout.strip() or "semantic observability coverage OK")
    return True


def run_fixture_schema_validation() -> bool:
    fixture = ROOT / "sdk/fixtures/sample-semantic-event-v1.json"
    try:
        import json

        from sdk.semantic_event_contract import validate_semantic_event

        data = json.loads(fixture.read_text(encoding="utf-8"))
        validate_semantic_event(data)
        _ok(f"fixture schema validation: ok {data.get('type')} {data.get('event_id')}")
        return True
    except ImportError:
        pass
    except Exception as exc:  # noqa: BLE001
        _fail(f"fixture schema validation failed: {exc}")
        return False
    env = os.environ.copy()
    env["PYTHONPATH"] = str(ROOT)
    proc = subprocess.run(
        [sys.executable, "scripts/validate_semantic_event.py", str(fixture)],
        cwd=ROOT,
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode == 0:
        _ok(f"fixture schema validation: {(proc.stdout or '').strip()}")
        return True
    container = os.getenv("MLAIR_CONTAINER_NAME", "mlair").strip() or "mlair"
    names = subprocess.run(
        ["docker", "ps", "--format", "{{.Names}}"],
        capture_output=True,
        text=True,
        check=False,
    )
    if container in (names.stdout or ""):
        subprocess.run(
            ["docker", "cp", str(fixture), f"{container}:/tmp/sample-semantic-event-v1.json"],
            check=False,
        )
        cmd = "PYTHONPATH=/app/api:/app python -c \"import json; from sdk.semantic_event_contract import validate_semantic_event; validate_semantic_event(json.load(open('/tmp/sample-semantic-event-v1.json'))); print('ok')\""
        proc = subprocess.run(
            ["docker", "exec", container, "sh", "-c", cmd],
            capture_output=True,
            text=True,
            check=False,
        )
        if proc.returncode == 0:
            _ok(f"fixture schema validation (container): {(proc.stdout or '').strip()}")
            return True
    _fail(f"sample semantic event validation failed:\n{proc.stdout}\n{proc.stderr}")
    return False


def run_container_phase9_tests() -> bool:
    container = os.getenv("MLAIR_CONTAINER_NAME", "mlair").strip() or "mlair"
    proc = subprocess.run(
        ["docker", "ps", "--format", "{{.Names}}"],
        capture_output=True,
        text=True,
        check=False,
    )
    if container not in (proc.stdout or ""):
        _ok("container Phase 9 tests skipped (stack not running)")
        return True

    lifecycle_test = ROOT / "api/tests/test_lifecycle_invariants.py"
    subprocess.run(
        ["docker", "cp", str(lifecycle_test), f"{container}:/app/api/tests/test_lifecycle_invariants.py"],
        check=False,
    )
    modules = " ".join(UNIT_TESTS_CONTAINER)
    cmd = (
        "cd /app/api && PYTHONPATH=/app/api:/app python -m unittest "
        f"{modules} tests.test_lifecycle_invariants -q"
    )
    proc = subprocess.run(
        ["docker", "exec", container, "sh", "-c", cmd],
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        _fail(f"container Phase 9 tests failed:\n{proc.stdout}\n{proc.stderr}")
        return False
    _ok("container Phase 9 tests passed (lifecycle invariants + event contract)")
    return True


def main() -> int:
    checks = [
        check_docs_and_artifacts(),
        run_host_unit_tests(),
        run_observability_coverage(),
        run_fixture_schema_validation(),
        run_container_phase9_tests(),
    ]
    passed = sum(1 for c in checks if c)
    total = len(checks)
    print(f"\nTOTAL {total} PASS {passed} FAIL {total - passed}")
    print("\nLifecycle contract verification complete.")
    return 0 if all(checks) else 1


if __name__ == "__main__":
    raise SystemExit(main())
