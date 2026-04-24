#!/usr/bin/env python3
"""Smoke: v0.3 — pipeline version, search, optional replay."""
from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request

BASE = os.getenv("ML_AIR_BASE_URL", "http://localhost:8080").rstrip("/")
TENANT = os.getenv("ML_AIR_TENANT", "default")
PROJECT = os.getenv("ML_AIR_PROJECT", "default_project")
TOKEN = os.getenv("ML_AIR_TOKEN", "maintainer-token")


def req(method: str, path: str, body: dict | None = None) -> tuple[int, dict]:
    data = None
    headers = {"Authorization": f"Bearer {TOKEN}"}
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    r = urllib.request.Request(f"{BASE}{path}", data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(r, timeout=30) as resp:
            raw = resp.read().decode("utf-8")
            return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8", errors="replace")
        try:
            return e.code, json.loads(err)
        except Exception:
            return e.code, {"detail": err}


def main() -> None:
    tag = str(int(time.time()))
    _st, v = req(
        "POST",
        f"/v1/tenants/{TENANT}/projects/{PROJECT}/pipelines/demo_pipeline/versions",
        {"config": {"steps": ["a", "b"], "tag": tag}},
    )
    assert "version_id" in v, v
    vid = v["version_id"]
    st, r = req("GET", f"/v1/tenants/{TENANT}/projects/{PROJECT}/search?q=demo&limit=5")
    assert st == 200, (st, r)
    assert "items" in r
    st2, child = req(
        "POST",
        f"/v1/tenants/{TENANT}/projects/{PROJECT}/runs",
        {
            "pipeline_id": "demo_pipeline",
            "idempotency_key": f"v03-run-{tag}",
            "pipeline_version_id": vid,
        },
    )
    assert st2 == 200, (st2, child)
    run_id = child.get("run_id", "")
    assert run_id, child
    st3, rep = req(
        "POST",
        f"/v1/tenants/{TENANT}/projects/{PROJECT}/runs/{run_id}/replay",
        {"from_task_id": f"{run_id}:task:1", "idempotency_key": f"v03-replay-{tag}"},
    )
    assert st3 == 200, (st3, rep)
    assert rep.get("replay_of_run_id") == run_id, rep
    print("[OK] v0.3 smoke:", tag)


if __name__ == "__main__":
    main()
