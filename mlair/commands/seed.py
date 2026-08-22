"""``mlair seed demo`` — create full demo data across all MLAir surfaces."""

from __future__ import annotations

import os
import subprocess
import sys

from mlair.paths import repo_root

DEMO_TARGET = "demo"

# Order matters: enable features → hub (+ multi-scope) → MLOps sprint → specialized demos → distributed.
_SEED_PIPELINE: tuple[tuple[str, str], ...] = (
    ("features", "seed_enable_features.py"),
    ("hub", "seed_demo.py"),
    ("mlops", "seed_mlops_features_demo.py"),
    ("metrics", "seed_metrics_demo.py"),
    ("phase5", "seed_phase5_demo.py"),
    ("resolve", "seed_resolve_demo.py"),
    ("governance", "seed_governance_demo.py"),
    ("distributed", "seed_distributed_demo.py"),
)

_SCRIPT_BY_NAME = {name: script for name, script in _SEED_PIPELINE}
SEED_STAGE_NAMES = tuple(name for name, _ in _SEED_PIPELINE)


def _run_script(script_name: str) -> int:
    script = repo_root() / "scripts" / script_name
    if not script.is_file():
        print(f"[mlair] seed script not found: {script}", file=sys.stderr)
        return 1
    env = os.environ.copy()
    proc = subprocess.run([sys.executable, str(script)], check=False, env=env)
    return int(proc.returncode)


def run_seed(*, target: str | None = None) -> int:
    """``mlair seed demo`` runs the full demo pipeline."""
    if target in (DEMO_TARGET, "all"):
        targets = _SEED_PIPELINE
    elif target:
        script = _SCRIPT_BY_NAME.get(target)
        if not script:
            print(f"[mlair] unknown seed target: {target}", file=sys.stderr)
            print(f"[mlair] use: mlair seed {DEMO_TARGET}", file=sys.stderr)
            return 2
        targets = ((target, script),)
    else:
        print(f"[mlair] usage: mlair seed {DEMO_TARGET}", file=sys.stderr)
        print(f"[mlair] optional stages: {', '.join(SEED_STAGE_NAMES)}", file=sys.stderr)
        return 2

    failed = False
    for name, script in targets:
        print(f"[mlair] seed: {name} ({script})")
        if _run_script(script) != 0:
            failed = True
    return 1 if failed else 0
