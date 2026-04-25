#!/usr/bin/env python3
from __future__ import annotations

import argparse
import subprocess
import sys
import time


def _run(command: list[str]) -> None:
    proc = subprocess.run(command, check=False)
    if proc.returncode != 0:
        raise RuntimeError(f"command failed: {' '.join(command)}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Run quickstart flow for fresh-machine validation.")
    parser.add_argument("--compose-file", default="deploy/docker-compose.quickstart.yml")
    args = parser.parse_args()

    started = time.time()
    try:
        _run(["python", "scripts/doctor.py", "--compose-file", args.compose_file])
        _run(["docker", "compose", "-f", args.compose_file, "up", "-d", "--build"])
        _run(["python", "scripts/check_quickstart_health.py", "--compose-file", args.compose_file, "--wait-seconds", "120"])
    except RuntimeError as exc:
        print(f"[FAIL] fresh machine test failed: {exc}")
        return 1

    elapsed = time.time() - started
    print(f'[PASS] fresh machine test success: {{"elapsed_seconds": {elapsed:.2f}}}')
    return 0


if __name__ == "__main__":
    sys.exit(main())
