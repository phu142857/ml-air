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

    request = urllib.request.Request(
        url=f"{BASE}{path}",
        method=method,
        headers=headers,
        data=data,
    )
    try:
        with urllib.request.urlopen(request, timeout=5) as resp:
            payload = resp.read().decode("utf-8")
            return resp.getcode(), json.loads(payload or "{}")
    except urllib.error.HTTPError as exc:
        payload = exc.read().decode("utf-8")
        try:
            return exc.code, json.loads(payload)
        except Exception:
            return exc.code, {"raw": payload}


def main() -> int:
    results: list[tuple[str, bool, str]] = []
    run_tag = str(int(time.time() * 1000))

    def record(name: str, ok: bool, detail: str = "") -> None:
        results.append((name, ok, detail))

    code, body = req("GET", "/health")
    record("health", code == 200 and body.get("status") == "ok", f"{code} {body}")

    code, body = req("GET", "/v1/auth/whoami", "viewer-token")
    record("whoami-viewer", code == 200 and body.get("role") == "viewer", f"{code} {body}")

    code, body = req(
        "POST",
        f"/v1/tenants/{TENANT}/projects/{PROJECT}/runs",
        "viewer-token",
        {"pipeline_id": "demo_pipeline", "idempotency_key": f"smoke-viewer-block-{run_tag}"},
    )
    record("rbac-viewer-block-trigger", code == 403, f"{code} {body}")

    code, body = req(
        "POST",
        f"/v1/tenants/{TENANT}/projects/{PROJECT}/runs",
        "maintainer-token",
        {"pipeline_id": "demo_pipeline", "idempotency_key": f"smoke-main-ok-{run_tag}"},
    )
    run_id = body.get("run_id") if code == 200 else None
    record("rbac-maintainer-trigger", code == 200 and bool(run_id), f"{code} {body}")

    run_ok = False
    if run_id:
        for _ in range(15):
            time.sleep(0.5)
            c, b = req(
                "GET",
                f"/v1/tenants/{TENANT}/projects/{PROJECT}/runs/{run_id}",
                "viewer-token",
            )
            if c == 200 and b.get("status") == "SUCCESS":
                run_ok = True
                break
    record("run-lifecycle-success", run_ok, f"run_id={run_id}")

    if run_id:
        c, b = req(
            "GET",
            f"/v1/tenants/{TENANT}/projects/{PROJECT}/runs/{run_id}/tasks",
            "viewer-token",
        )
        items = b.get("items", [])
        count = len(items) if isinstance(items, list) else -1
        record("tasks-read", c == 200 and count >= 1, f"{c} items={count}")
    else:
        record("tasks-read", False, "no run_id")

    c, b = req(
        "POST",
        f"/v1/tenants/{TENANT}/projects/{PROJECT}/runs",
        "maintainer-token",
        {"pipeline_id": "fail_once_pipeline", "idempotency_key": f"smoke-retry-{run_tag}"},
    )
    retry_run_id = b.get("run_id") if c == 200 else None
    retry_ok = False
    if retry_run_id:
        for _ in range(20):
            time.sleep(0.5)
            c2, b2 = req(
                "GET",
                f"/v1/tenants/{TENANT}/projects/{PROJECT}/runs/{retry_run_id}",
                "viewer-token",
            )
            if c2 == 200 and b2.get("status") == "SUCCESS":
                retry_ok = True
                break
    record("retry-fail-once-success", retry_ok, f"run_id={retry_run_id}")

    c, b = req(
        "POST",
        f"/v1/tenants/{TENANT}/projects/{PROJECT}/runs",
        "maintainer-token",
        {"pipeline_id": "always_fail_pipeline", "idempotency_key": f"smoke-dlq-{run_tag}"},
    )
    dlq_run_id = b.get("run_id") if c == 200 else None
    dlq_failed = False
    if dlq_run_id:
        for _ in range(25):
            time.sleep(0.5)
            c2, b2 = req(
                "GET",
                f"/v1/tenants/{TENANT}/projects/{PROJECT}/runs/{dlq_run_id}",
                "viewer-token",
            )
            if c2 == 200 and b2.get("status") == "FAILED":
                dlq_failed = True
                break
    record("dlq-run-failed", dlq_failed, f"run_id={dlq_run_id}")

    if dlq_run_id:
        c, b = req(
            "POST",
            f"/v1/tenants/{TENANT}/projects/{PROJECT}/runs/{dlq_run_id}/dlq/replay",
            "maintainer-token",
        )
        replayed = b.get("replayed", 0)
        replay_ok = c == 200 and isinstance(replayed, int) and replayed >= 0
        record("dlq-replay", replay_ok, f"{c} {b}")
    else:
        record("dlq-replay", False, "no dlq run")

    if run_id:
        c, b = req(
            "GET",
            f"/v1/tenants/{TENANT}/projects/{PROJECT}/runs/{run_id}/logs",
            "viewer-token",
        )
        items = b.get("items")
        count = len(items) if isinstance(items, list) else -1
        record("logs-read", c == 200 and isinstance(items, list), f"{c} items={count}")

    for name, ok, detail in results:
        print(f"[{'PASS' if ok else 'FAIL'}] {name} :: {detail}")

    failed = [entry for entry in results if not entry[1]]
    print(f"\nTOTAL {len(results)} FAIL {len(failed)}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
