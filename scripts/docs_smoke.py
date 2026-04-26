#!/usr/bin/env python3
from __future__ import annotations

import json
import subprocess
import sys


def run(cmd: list[str], check: bool = True) -> subprocess.CompletedProcess[str]:
    proc = subprocess.run(cmd, text=True, capture_output=True, check=False)
    if check and proc.returncode != 0:
        raise RuntimeError(f"command failed: {' '.join(cmd)}\n{proc.stdout}\n{proc.stderr}")
    return proc


def main() -> int:
    try:
        run(["make", "up"])
        run(["make", "health"])
        run(["make", "seed-demo"])
        run(["python", "./mlair", "--help"])
        run(["python", "./mlair", "run", "examples/pipeline.demo.yaml"])
    except RuntimeError as exc:
        print(f"[FAIL] docs smoke failed: {exc}")
        return 1
    print(
        json.dumps(
            {
                "status": "ok",
                "checks": [
                    "make up",
                    "make health",
                    "make seed-demo",
                    "mlair --help",
                    "mlair run examples/pipeline.demo.yaml",
                ],
            }
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
