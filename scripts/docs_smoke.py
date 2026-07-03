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
        run(["python", "-m", "mlair", "rebuild"])
        run(["python", "-m", "mlair", "health"])
        run(["make", "seed-demo"])
        run(["python", "-m", "mlair", "--help"])
        run(["python", "-m", "mlair", "run", "examples/pipeline.demo.yaml"])
    except RuntimeError as exc:
        msg = str(exc)
        print(f"[FAIL] docs smoke failed: {msg}")
        if "TLS handshake timeout" in msg or "timeout" in msg.lower():
            print(
                "[HINT] Image pull or registry failed — check network/VPN/firewall, then retry "
                "`mlair rebuild` before `python scripts/docs_smoke.py`."
            )
        return 1
    print(
        json.dumps(
            {
                "status": "ok",
                "checks": [
                    "mlair rebuild",
                    "mlair health",
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
