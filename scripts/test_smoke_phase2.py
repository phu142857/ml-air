#!/usr/bin/env python3
import json
import os
import time
import urllib.error
import urllib.request


BASE = os.getenv("ML_AIR_BASE_URL", "http://localhost:8080").rstrip("/")
TENANT = os.getenv("ML_AIR_TENANT_ID", "default")
PROJECT = os.getenv("ML_AIR_PROJECT_ID", "default_project")


def req(method: str, path: str, token: str | None = None, body: dict | None = None) -> tuple[int, dict]:
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode("utf-8")
    request = urllib.request.Request(url=f"{BASE}{path}", method=method, headers=headers, data=data)
    try:
        with urllib.request.urlopen(request, timeout=10) as resp:
            payload = resp.read().decode("utf-8")
            return resp.getcode(), json.loads(payload or "{}")
    except urllib.error.HTTPError as exc:
        payload = exc.read().decode("utf-8")
        try:
            return exc.code, json.loads(payload or "{}")
        except Exception:
            return exc.code, {"raw": payload}


def wait_run_status(run_id: str, expected: str, timeout_s: int = 20) -> bool:
    loops = max(1, timeout_s * 2)
    for _ in range(loops):
        c, b = req(
            "GET",
            f"/v1/tenants/{TENANT}/projects/{PROJECT}/runs/{run_id}",
            "viewer-token",
        )
        if c == 200 and str(b.get("status", "")).upper() == expected.upper():
            return True
        time.sleep(0.5)
    return False


def main() -> int:
    tag = str(int(time.time() * 1000))
    results: list[tuple[str, bool, str]] = []

    def record(name: str, ok: bool, detail: str = "") -> None:
        results.append((name, ok, detail))

    # 1) experiment
    c, b = req(
        "POST",
        f"/v1/tenants/{TENANT}/projects/{PROJECT}/experiments",
        "maintainer-token",
        {"name": f"phase2-exp-{tag}", "description": "phase2 smoke"},
    )
    experiment_id = b.get("experiment_id") if c == 200 else None
    record("create-experiment", c == 200 and bool(experiment_id), f"{c} {b}")

    # 2) two runs for compare
    c1, b1 = req(
        "POST",
        f"/v1/tenants/{TENANT}/projects/{PROJECT}/runs",
        "maintainer-token",
        {"pipeline_id": "demo_pipeline", "idempotency_key": f"phase2-run1-{tag}", "experiment_id": experiment_id},
    )
    run1 = b1.get("run_id") if c1 == 200 else None
    record("trigger-run-1", c1 == 200 and bool(run1), f"{c1} {b1}")

    c2, b2 = req(
        "POST",
        f"/v1/tenants/{TENANT}/projects/{PROJECT}/runs",
        "maintainer-token",
        {"pipeline_id": "demo_pipeline", "idempotency_key": f"phase2-run2-{tag}", "experiment_id": experiment_id},
    )
    run2 = b2.get("run_id") if c2 == 200 else None
    record("trigger-run-2", c2 == 200 and bool(run2), f"{c2} {b2}")

    if run1:
        record("run-1-success", wait_run_status(run1, "SUCCESS", timeout_s=20), f"run_id={run1}")
    if run2:
        record("run-2-success", wait_run_status(run2, "SUCCESS", timeout_s=20), f"run_id={run2}")

    # 3) tracking logs
    if run1:
        c, b = req(
            "POST",
            f"/v1/tenants/{TENANT}/projects/{PROJECT}/runs/{run1}/params",
            "maintainer-token",
            {"key": "lr", "value": "0.001"},
        )
        record("log-param", c == 200, f"{c} {b}")

        c, b = req(
            "POST",
            f"/v1/tenants/{TENANT}/projects/{PROJECT}/runs/{run1}/metrics",
            "maintainer-token",
            {"key": "accuracy", "value": 0.91, "step": 1},
        )
        record("log-metric-run1", c == 200, f"{c} {b}")

        c, b = req(
            "POST",
            f"/v1/tenants/{TENANT}/projects/{PROJECT}/runs/{run1}/artifacts",
            "maintainer-token",
            {"path": "model.pkl", "uri": f"s3://mlair/{run1}/model.pkl"},
        )
        record("log-artifact", c == 200, f"{c} {b}")

    if run2:
        c, b = req(
            "POST",
            f"/v1/tenants/{TENANT}/projects/{PROJECT}/runs/{run2}/metrics",
            "maintainer-token",
            {"key": "accuracy", "value": 0.95, "step": 1},
        )
        record("log-metric-run2", c == 200, f"{c} {b}")

    if run1:
        c, b = req("GET", f"/v1/tenants/{TENANT}/projects/{PROJECT}/runs/{run1}/tracking", "viewer-token")
        has_param = any(x.get("key") == "lr" for x in b.get("params", [])) if isinstance(b, dict) else False
        has_metric = any(x.get("key") == "accuracy" for x in b.get("metrics", [])) if isinstance(b, dict) else False
        has_artifact = any(x.get("path") == "model.pkl" for x in b.get("artifacts", [])) if isinstance(b, dict) else False
        record("tracking-read", c == 200 and has_param and has_metric and has_artifact, f"{c}")

    # 4) compare
    if run1 and run2:
        c, b = req(
            "POST",
            f"/v1/tenants/{TENANT}/projects/{PROJECT}/runs/compare",
            "viewer-token",
            {"run_ids": [run1, run2]},
        )
        items = b.get("items", []) if isinstance(b, dict) else []
        record("compare-runs", c == 200 and len(items) >= 2, f"{c} items={len(items)}")

    # 5) model registry flow
    c, b = req(
        "POST",
        f"/v1/tenants/{TENANT}/projects/{PROJECT}/models",
        "maintainer-token",
        {"name": f"phase2-model-{tag}", "description": "phase2 smoke model"},
    )
    model_id = b.get("model_id") if c == 200 else None
    record("create-model", c == 200 and bool(model_id), f"{c} {b}")

    if model_id and run1:
        c, b = req(
            "POST",
            f"/v1/tenants/{TENANT}/projects/{PROJECT}/models/{model_id}/versions",
            "maintainer-token",
            {"run_id": run1, "artifact_uri": f"s3://mlair/{run1}/model.pkl", "stage": "staging"},
        )
        version = b.get("version") if c == 200 else None
        record("create-model-version", c == 200 and isinstance(version, int), f"{c} {b}")

        c, b = req(
            "POST",
            f"/v1/tenants/{TENANT}/projects/{PROJECT}/models/{model_id}/promote",
            "maintainer-token",
            {"version": version, "stage": "production"},
        )
        record("promote-model-version", c == 200 and b.get("stage") == "production", f"{c} {b}")

    for name, ok, detail in results:
        print(f"[{'PASS' if ok else 'FAIL'}] {name} :: {detail}")
    failed = [r for r in results if not r[1]]
    print(f"\nTOTAL {len(results)} FAIL {len(failed)}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
