"""``mlair remove`` — remove seeded demo resources."""

from __future__ import annotations

import subprocess
import sys

from mlair.paths import repo_root


def run_remove_demo() -> int:
    script = repo_root() / "scripts" / "remove_demo.py"
    if not script.is_file():
        print(f"[mlair] remove script not found: {script}", file=sys.stderr)
        return 1
    proc = subprocess.run([sys.executable, str(script)], check=False)
    return int(proc.returncode)
