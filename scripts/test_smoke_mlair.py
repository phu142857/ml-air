#!/usr/bin/env python3
import json
import os
import time
import uuid
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


def req_multipart(
    path: str,
    token: str | None,
    fields: dict[str, str],
    file_bytes: bytes,
    filename: str = "data.csv",
) -> tuple[int, dict]:
    boundary = f"----mlairSmoke{uuid.uuid4().hex}"
    crlf = b"\r\n"
    parts: list[bytes] = []
    for fk, fv in fields.items():
        parts.append(f"--{boundary}".encode("ascii"))
        parts.append(crlf)
        parts.append(f'Content-Disposition: form-data; name="{fk}"'.encode("ascii"))
        parts.append(crlf)
        parts.append(crlf)
        parts.append(str(fv).encode("utf-8"))
        parts.append(crlf)
    parts.append(f"--{boundary}".encode("ascii"))
    parts.append(crlf)
    disp = f'Content-Disposition: form-data; name="file"; filename="{filename}"'
    parts.append(disp.encode("ascii"))
    parts.append(crlf)
    parts.append(b"Content-Type: text/csv")
    parts.append(crlf)
    parts.append(crlf)
    parts.append(file_bytes)
    parts.append(crlf)
    parts.append(f"--{boundary}--".encode("ascii"))
    parts.append(crlf)
    body = b"".join(parts)
    headers: dict[str, str] = {"Content-Type": f"multipart/form-data; boundary={boundary}"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = urllib.request.Request(url=f"{BASE}{path}", method="POST", headers=headers, data=body)
    try:
        with urllib.request.urlopen(request, timeout=30) as resp:
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

    mtag = f"mc{run_tag}"
    pl_id = f"smoke_modelcentric_{run_tag}"
    c0, b0 = req(
        "POST",
        f"/v1/tenants/{TENANT}/projects/{PROJECT}/models",
        "maintainer-token",
        {"name": f"Smoke Model {mtag}", "description": "smoke model-centric"},
    )
    mid = b0.get("model_id") if c0 == 200 else None
    record("model-create", c0 == 200 and bool(mid), f"{c0} {b0}")

    c1, b1 = req(
        "POST",
        f"/v1/tenants/{TENANT}/projects/{PROJECT}/pipelines/{pl_id}/versions",
        "maintainer-token",
        {"config": {"tasks": [{"id": "t1", "plugin": "echo_tracking"}]}},
    )
    record("pipeline-version-for-mapping", c1 == 200 and bool(b1.get("version_id")), f"{c1} {b1}")

    if mid:
        c2, b2 = req(
            "PUT",
            f"/v1/tenants/{TENANT}/projects/{PROJECT}/models/{mid}/pipeline-mapping",
            "maintainer-token",
            {"pipeline_id": pl_id},
        )
        record("model-pipeline-mapping", c2 == 200 and b2.get("pipeline_id") == pl_id, f"{c2} {b2}")
        c3, b3 = req("GET", f"/v1/tenants/{TENANT}/projects/{PROJECT}/models/{mid}/resolved-pipeline", "viewer-token")
        record("model-resolved-pipeline", c3 == 200 and b3.get("pipeline_id") == pl_id, f"{c3} {b3}")
        csv_lines = ["id,value"] + [f"{i},{i}" for i in range(5)]
        csv_body = ("\n".join(csv_lines) + "\n").encode("utf-8")
        ds_name = f"smoke_ds_{mtag}"
        c4, b4 = req_multipart(
            f"/v1/tenants/{TENANT}/projects/{PROJECT}/datasets/upload",
            "maintainer-token",
            {"dataset_name": ds_name},
            csv_body,
        )
        dsid = b4.get("dataset_id") if c4 == 200 else None
        record("dataset-upload", c4 == 200 and bool(dsid), f"{c4} {b4}")
        if dsid:
            c5, b5 = req(
                "POST",
                f"/v1/tenants/{TENANT}/projects/{PROJECT}/runs/trigger",
                "maintainer-token",
                {
                    "model_id": mid,
                    "dataset_id": dsid,
                    "idempotency_key": f"smoke-trigger-{run_tag}",
                },
            )
            trig_ok = c5 == 200 and bool(b5.get("run_id")) and b5.get("resolved_pipeline_id") == pl_id
            record("runs-trigger", trig_ok, f"{c5} {b5}")
        else:
            record("runs-trigger", False, "no dataset_id")
    else:
        record("model-pipeline-mapping", False, "no model_id")
        record("model-resolved-pipeline", False, "no model_id")
        record("dataset-upload", False, "no model_id")
        record("runs-trigger", False, "no model_id")

    for name, ok, detail in results:
        print(f"[{'PASS' if ok else 'FAIL'}] {name} :: {detail}")

    failed = [entry for entry in results if not entry[1]]
    print(f"\nTOTAL {len(results)} FAIL {len(failed)}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
