#!/usr/bin/env python3
"""MLAir Cluster Agent — sends heartbeat to control plane."""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request


def main() -> None:
    api_base = os.getenv("ML_AIR_API_BASE_URL", "http://api:8080").rstrip("/")
    cluster_id = os.getenv("ML_AIR_CLUSTER_ID", "").strip()
    agent_token = os.getenv("ML_AIR_CLUSTER_AGENT_TOKEN", "").strip()
    interval = max(10, int(os.getenv("ML_AIR_CLUSTER_HEARTBEAT_INTERVAL_SEC", "30")))
    if not cluster_id or not agent_token:
        print("ML_AIR_CLUSTER_ID and ML_AIR_CLUSTER_AGENT_TOKEN required", file=sys.stderr)
        sys.exit(1)

    gpu = int(os.getenv("ML_AIR_CLUSTER_GPU_AVAILABLE", "0"))
    cpu = int(os.getenv("ML_AIR_CLUSTER_CPU_CORES", "8"))
    url = f"{api_base}/v1/distributed/clusters/{cluster_id}/heartbeat"
    headers = {"Content-Type": "application/json"}

    while True:
        payload = {
            "agent_token": agent_token,
            "capacity": {
                "gpu_available": gpu,
                "cpu_cores_available": cpu,
                "node_pools": [{"name": "default", "nodes": [os.getenv("ML_AIR_CLUSTER_NODE_ID", "node-1")]}],
            },
            "health_status": "healthy",
        }
        body = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(url, data=body, method="POST", headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:  # noqa: S310
                print(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            print(f"heartbeat_failed status={exc.code}", file=sys.stderr)
        except urllib.error.URLError as exc:
            print(f"heartbeat_failed url_err={exc}", file=sys.stderr)
        time.sleep(interval)


if __name__ == "__main__":
    main()
