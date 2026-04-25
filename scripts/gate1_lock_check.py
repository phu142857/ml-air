#!/usr/bin/env python3
from __future__ import annotations

import argparse
import subprocess
import sys
import time


def _run(cmd: list[str]) -> None:
    proc = subprocess.run(cmd, check=False)
    if proc.returncode != 0:
        raise RuntimeError(f"command failed: {' '.join(cmd)}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Gate 1 lock check (clone -> up -> ui/demo smoke).")
    parser.add_argument("--max-seconds", type=int, default=300)
    parser.add_argument("--compose-file", default="deploy/docker-compose.quickstart.yml")
    args = parser.parse_args()

    started = time.time()
    steps = [
        ["python", "scripts/doctor.py", "--compose-file", args.compose_file],
        ["make", "rebuild"],
        ["python", "scripts/check_quickstart_health.py", "--compose-file", args.compose_file, "--wait-seconds", "120"],
        ["python", "scripts/seed_demo.py"],
        ["python", "scripts/smoke_quickstart.py"],
    ]
    try:
        for step in steps:
            _run(step)
    except RuntimeError as exc:
        print(f"[FAIL] gate1 lock check failed: {exc}")
        return 1

    elapsed = time.time() - started
    print(f'[INFO] gate1 elapsed_seconds={elapsed:.2f} max_seconds={args.max_seconds}')
    if elapsed > args.max_seconds:
        print("[FAIL] gate1 lock check exceeded time budget")
        return 1
    print("[PASS] gate1 lock check passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
