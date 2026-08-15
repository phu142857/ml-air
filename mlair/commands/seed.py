"""``mlair seed`` — create full demo data across all MLAir surfaces."""

from __future__ import annotations

import os
import subprocess
import sys

from mlair.paths import repo_root

# Order matters: enable features → core hub data → specialized demos → governance → distributed.
_SEED_PIPELINE: tuple[tuple[str, str], ...] = (
    ("features", "seed_enable_features.py"),
    ("demo", "seed_demo.py"),
    ("metrics", "seed_metrics_demo.py"),
    ("phase5", "seed_phase5_demo.py"),
    ("resolve", "seed_resolve_demo.py"),
    ("governance", "seed_governance_demo.py"),
    ("distributed", "seed_distributed_demo.py"),
)

_SCRIPT_BY_NAME = {name: script for name, script in _SEED_PIPELINE}


def _run_script(script_name: str) -> int:
    script = repo_root() / "scripts" / script_name
    if not script.is_file():
        print(f"[mlair] seed script not found: {script}", file=sys.stderr)
        return 1
    env = os.environ.copy()
    proc = subprocess.run([sys.executable, str(script)], check=False, env=env)
    return int(proc.returncode)


def run_seed(*, target: str | None = None) -> int:
    """``mlair seed`` and ``mlair seed all`` seed every demo surface."""
    if target == "all" or target is None:
        targets = _SEED_PIPELINE
    else:
        script = _SCRIPT_BY_NAME.get(target)
        if not script:
            print(f"[mlair] unknown seed target: {target}", file=sys.stderr)
            return 2
        targets = ((target, script),)

    failed = False
    for name, script in targets:
        print(f"[mlair] seed: {name} ({script})")
        if _run_script(script) != 0:
            failed = True
    return 1 if failed else 0
