#!/usr/bin/env python3
"""Rich Hub demo seed for screenshots: SUCCESS / FAILED / RUNNING + lineage.

Works with ML_AIR_TASK_EXECUTION_MODE=external (all-in-one default) by leasing
and completing tasks like an external worker.

  make seed-demo
  python3 scripts/seed_demo.py
"""

from __future__ import annotations

import csv
import io
import json
import math
import os
import sys
import threading
import time
import uuid
import urllib.error
import urllib.request
from pathlib import Path

_scripts = Path(__file__).resolve().parent
if str(_scripts) not in sys.path:
    sys.path.insert(0, str(_scripts))
from identity_smoke_token import resolve_smoke_bearer_token  # noqa: E402
from smoke_common import require_api_reachable  # noqa: E402

BASE = os.getenv("ML_AIR_BASE_URL", "http://localhost:8080").rstrip("/")
TENANT = os.getenv("ML_AIR_TENANT_ID", "default")
PROJECT = os.getenv("ML_AIR_PROJECT_ID", "default_project")


def req(method: str, path: str, token: str, body: dict | None = None, timeout: int = 30) -> tuple[int, dict]:
    headers: dict[str, str] = {"Authorization": f"Bearer {token}"}
    data = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode("utf-8")
    request = urllib.request.Request(url=f"{BASE}{path}", method=method, headers=headers, data=data)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as resp:
            payload = resp.read().decode("utf-8")
            return resp.getcode(), json.loads(payload or "{}")
    except urllib.error.HTTPError as exc:
        payload = exc.read().decode("utf-8")
        try:
            return exc.code, json.loads(payload)
        except Exception:
            return exc.code, {"raw": payload}


def req_multipart(path: str, token: str, fields: dict[str, str], file_bytes: bytes, filename: str) -> tuple[int, dict]:
    boundary = f"----mlairSeed{uuid.uuid4().hex}"
    crlf = b"\r\n"
    parts: list[bytes] = []
    for key, value in fields.items():
        parts.extend(
            [
                f"--{boundary}".encode("ascii"),
                crlf,
                f'Content-Disposition: form-data; name="{key}"'.encode("ascii"),
                crlf,
                crlf,
                str(value).encode("utf-8"),
                crlf,
            ]
        )
    parts.extend(
        [
            f"--{boundary}".encode("ascii"),
            crlf,
            f'Content-Disposition: form-data; name="file"; filename="{filename}"'.encode("ascii"),
            crlf,
            b"Content-Type: text/csv",
            crlf,
            crlf,
            file_bytes,
            crlf,
            f"--{boundary}--".encode("ascii"),
            crlf,
        ]
    )
    request = urllib.request.Request(
        url=f"{BASE}{path}",
        method="POST",
        headers={"Authorization": f"Bearer {token}", "Content-Type": f"multipart/form-data; boundary={boundary}"},
        data=b"".join(parts),
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as resp:
            return resp.getcode(), json.loads(resp.read().decode("utf-8") or "{}")
    except urllib.error.HTTPError as exc:
        payload = exc.read().decode("utf-8")
        try:
            return exc.code, json.loads(payload)
        except Exception:
            return exc.code, {"raw": payload}


def csv_bytes(rows: int, *, label: str) -> bytes:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["sample_id", "split", "feature_a", "feature_b", "label", "source"])
    for i in range(rows):
        writer.writerow(
            [
                f"{label}-{i:04d}",
                "train" if i % 5 else "val",
                round(math.sin(i / 7.0) + i * 0.01, 4),
                round(math.cos(i / 11.0) * 2.0, 4),
                int(i % 3 == 0),
                label,
            ]
        )
    return buf.getvalue().encode("utf-8")


def external_mode(token: str) -> bool:
    code, body = req(
        "POST",
        "/v1/tasks/lease",
        token,
        {"worker_id": "seed-probe", "capabilities": ["echo_tracking"], "max_tasks": 1},
    )
    return code == 200 and body.get("execution_mode") == "external"


def drain_worker(
    stop: threading.Event,
    token: str,
    *,
    capabilities: list[str],
    fail_pipeline_prefixes: tuple[str, ...] = ("always_fail",),
    hold_pipeline_prefixes: tuple[str, ...] = ("demo_running",),
    worker_id: str = "seed-demo-worker",
) -> None:
    """Lease and complete/fail tasks until stop is set."""
    while not stop.is_set():
        code, lease = req(
            "POST",
            "/v1/tasks/lease",
            token,
            {"worker_id": worker_id, "capabilities": capabilities, "max_tasks": 3},
        )
        if code != 200:
            time.sleep(0.8)
            continue
        tasks = lease.get("tasks") or []
        if not tasks:
            time.sleep(0.4)
            continue
        for task in tasks:
            task_id = str(task.get("task_id") or "")
            run_id = str(task.get("run_id") or "")
            pipeline_id = str(task.get("pipeline_id") or "")
            if not task_id:
                continue
            if any(pipeline_id.startswith(p) for p in hold_pipeline_prefixes):
                # Keep leased tasks for RUNNING screenshots — heartbeat then leave them.
                req("POST", f"/v1/tasks/{task_id}/heartbeat", token, {"worker_id": worker_id})
                continue
            if any(pipeline_id.startswith(p) for p in fail_pipeline_prefixes):
                req(
                    "POST",
                    f"/v1/tasks/{task_id}/fail",
                    token,
                    {"worker_id": worker_id, "error": "seed_demo_intentional_failure: nan_loss_spike"},
                )
                continue
            ctx = (task.get("payload") or {}).get("context") or task.get("context") or {}
            complete_body: dict = {
                "worker_id": worker_id,
                "params": ctx.get("params") or {"seed": "demo"},
                "metrics": ctx.get("metrics") or {"seed_score": {"step": 1, "value": 0.91}},
                "artifacts": ctx.get("artifacts")
                or [{"path": f"demo/{run_id}/artifact.json", "uri": f"s3://mlair/demo/{run_id}/artifact.json"}],
            }
            # Ingest lineage on train/evaluate (API requires non-null record_count → size on items).
            if task_id.endswith(":train") or task_id.endswith(":evaluate"):
                lineage = ctx.get("lineage")
                if isinstance(lineage, dict) and (lineage.get("inputs") or lineage.get("outputs")):
                    complete_body["lineage"] = _normalize_lineage_sizes(lineage)
            req("POST", f"/v1/tasks/{task_id}/complete", token, complete_body)


def _normalize_lineage_sizes(lineage: dict) -> dict:
    """Ensure each input/output has size so dataset_versions.record_count is non-null."""
    out = dict(lineage)
    for key in ("inputs", "outputs"):
        items = out.get(key)
        if not isinstance(items, list):
            continue
        fixed = []
        for i, item in enumerate(items):
            if not isinstance(item, dict):
                continue
            row = dict(item)
            if row.get("size") is None and row.get("row_count") is None and row.get("current_size") is None:
                row["size"] = 120 if key == "inputs" else max(1, i + 1)
            fixed.append(row)
        out[key] = fixed
    return out


def pick_task_id(token: str, run_id: str, prefer: str = "train") -> str | None:
    code, body = req("GET", f"/v1/tenants/{TENANT}/projects/{PROJECT}/runs/{run_id}/tasks", token)
    items = body.get("items") if code == 200 and isinstance(body, dict) else None
    if not isinstance(items, list) or not items:
        return None
    preferred = f"{run_id}:{prefer}"
    for item in items:
        if str(item.get("task_id") or "") == preferred:
            return preferred
    for item in items:
        tid = str(item.get("task_id") or "")
        if tid.endswith(f":{prefer}"):
            return tid
    return str(items[0].get("task_id") or "") or None


def wait_terminal(run_id: str, token: str, timeout_s: int = 120) -> str:
    path = f"/v1/tenants/{TENANT}/projects/{PROJECT}/runs/{run_id}"
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        code, body = req("GET", path, token)
        if code == 200:
            status = str(body.get("status") or "").upper()
            if status in {"SUCCESS", "FAILED", "CANCELLED"}:
                return status
        time.sleep(0.7)
    return "TIMEOUT"


def log_curve(token: str, run_id: str, *, variant: str) -> None:
    base = f"/v1/tenants/{TENANT}/projects/{PROJECT}/runs/{run_id}"
    req("POST", f"{base}/params", token, {"key": "framework", "value": "pytorch"})
    req("POST", f"{base}/params", token, {"key": "model_family", "value": "resnet18-demo"})
    req("POST", f"{base}/params", token, {"key": "variant", "value": variant})
    for step in range(1, 25):
        t = step / 24.0
        if variant == "success":
            loss, acc, map50 = 1.1 * (0.87**step), 0.55 + t * 0.4, 0.5 + t * 0.41
        elif variant == "failed":
            loss, acc, map50 = 0.2 + t * 0.7, 0.88 - t * 0.35, 0.8 - t * 0.4
        else:
            loss, acc, map50 = 0.9 * (0.9**step), 0.5 + t * 0.25, 0.45 + t * 0.2
        for key, value in (("loss", loss), ("accuracy", acc), ("mAP50", map50)):
            req("POST", f"{base}/metrics", token, {"key": key, "value": round(value, 5), "step": step})


def ensure_dataset(token: str, name: str, rows: int) -> tuple[str, str]:
    code, listed = req("GET", f"/v1/tenants/{TENANT}/projects/{PROJECT}/datasets?limit=100", token)
    if code == 200:
        for item in listed.get("items") or []:
            if str(item.get("name") or "") == name:
                dataset_id = str(item.get("id") or "")
                code_v, vers = req(
                    "GET",
                    f"/v1/tenants/{TENANT}/projects/{PROJECT}/datasets/{dataset_id}/versions",
                    token,
                )
                if code_v == 200 and (vers.get("items") or []):
                    version_id = str(vers["items"][0].get("id") or vers["items"][0].get("version_id") or "")
                    if dataset_id and version_id:
                        return dataset_id, version_id
    code, body = req_multipart(
        f"/v1/tenants/{TENANT}/projects/{PROJECT}/datasets/upload",
        token,
        {"dataset_name": name},
        csv_bytes(rows, label=name),
        f"{name}.csv",
    )
    if code not in {200, 201}:
        raise RuntimeError(f"upload {name}: {code} {body}")
    return str(body["dataset_id"]), str(body["version_id"])


def ensure_pipeline(token: str, pipeline_id: str, dataset_name: str, *, tasks: list[dict]) -> str:
    code, body = req(
        "POST",
        f"/v1/tenants/{TENANT}/projects/{PROJECT}/pipelines/{pipeline_id}/versions",
        token,
        {
            "config": {
                "tasks": tasks,
                "inputs": [{"dataset": dataset_name, "required_size": 20}],
            }
        },
    )
    if code != 200:
        raise RuntimeError(f"pipeline {pipeline_id}: {code} {body}")
    return str(body.get("version_id") or "")


def trigger_run(
    token: str,
    *,
    pipeline_id: str,
    dataset_id: str,
    dataset_name: str,
    dataset_version_id: str,
    label: str,
    tag: str,
) -> str:
    lineage = {
        "inputs": [
            {
                "name": dataset_name,
                "version": "v1",
                "uri": f"dataset://{dataset_id}/{dataset_version_id}",
                "source_type": "csv_import",
                "size": 120,
            }
        ],
        "outputs": [
            {
                "name": f"demo_model_{label}",
                "version": f"v-{tag[-6:]}",
                "uri": f"s3://mlair/demo/{label}/{tag}/model.pkl",
                "source_type": "etl",
                "size": 1,
            },
            {
                "name": f"demo_metrics_{label}",
                "version": f"v-{tag[-6:]}",
                "uri": f"s3://mlair/demo/{label}/{tag}/metrics.json",
                "source_type": "etl",
                "size": 1,
            },
        ],
    }
    code, body = req(
        "POST",
        f"/v1/tenants/{TENANT}/projects/{PROJECT}/runs",
        token,
        {
            "pipeline_id": pipeline_id,
            "dataset_version_id": dataset_version_id,
            "idempotency_key": f"seed-demo-{label}-{tag}",
            "plugin_name": "echo_tracking",
            "use_latest_pipeline_version": True,
            "override_config": {
                "dataset_version_id": dataset_version_id,
                "inputs": [{"dataset": dataset_name, "required_size": 20}],
            },
            "context": {
                "dataset_id": dataset_id,
                "dataset_version_id": dataset_version_id,
                "params": {
                    "demo_source": "seed_demo",
                    "run_label": label,
                    "experiment": "screenshot-gallery",
                },
                "metrics": {"seed_score": {"step": 0, "value": 0.64}},
                "artifacts": [
                    {"path": f"demo/{label}/{tag}/checkpoint.pt", "uri": f"s3://mlair/demo/{label}/{tag}/checkpoint.pt"}
                ],
                "lineage": lineage,
            },
        },
    )
    if code != 200 or not body.get("run_id"):
        raise RuntimeError(f"trigger {label}: {code} {body}")
    return str(body["run_id"])


def ingest_lineage(
    token: str,
    run_id: str,
    dataset_id: str,
    dataset_version_id: str,
    dataset_name: str,
    tag: str,
    *,
    task_key: str = "train",
) -> None:
    task_id = pick_task_id(token, run_id, prefer=task_key) or f"{run_id}:{task_key}"
    payload = {
        "run_id": run_id,
        "task_id": task_id,
        "lineage": {
            "inputs": [
                {
                    "name": dataset_name,
                    "version": "v1",
                    "uri": f"dataset://{dataset_id}/{dataset_version_id}",
                    "source_type": "csv_import",
                    "size": 120,
                }
            ],
            "outputs": [
                {
                    "name": f"demo_model_artifact_{tag[-8:]}",
                    "version": f"v-{tag[-6:]}",
                    "uri": f"s3://mlair/demo/{run_id}/model.pkl",
                    "source_type": "etl",
                    "size": 1,
                },
                {
                    "name": f"demo_eval_report_{tag[-8:]}",
                    "version": f"v-{tag[-6:]}",
                    "uri": f"s3://mlair/demo/{run_id}/eval.json",
                    "source_type": "etl",
                    "size": 1,
                },
            ],
        },
    }
    code, body = req(
        "POST",
        f"/v1/tenants/{TENANT}/projects/{PROJECT}/lineage/ingest",
        token,
        payload,
    )
    if code not in {200, 201} or not (isinstance(body, dict) and body.get("ingested")):
        print(f"[WARN] lineage ingest: {code} {body}")
        return
    edges = int(body.get("edges") or 0)
    # Verify graph is visible on read API
    code2, graph = req("GET", f"/v1/tenants/{TENANT}/projects/{PROJECT}/lineage/runs/{run_id}", token)
    n = len(graph.get("edges") or []) if code2 == 200 and isinstance(graph, dict) else -1
    print(f"[OK] lineage ingest for {run_id} (wrote={edges}, graph_edges={n}, task={task_id})")


def ensure_model(token: str, name: str, run_id: str) -> str:
    code, body = req(
        "POST",
        f"/v1/tenants/{TENANT}/projects/{PROJECT}/models",
        token,
        {"name": name, "description": "Screenshot demo model"},
    )
    model_id = None
    if code in {200, 201} and isinstance(body, dict) and body.get("model_id"):
        model_id = str(body["model_id"])
    elif code in {409, 200} or (isinstance(body, dict) and body.get("detail") == "model_name_exists"):
        code, listed = req("GET", f"/v1/tenants/{TENANT}/projects/{PROJECT}/models?limit=100", token)
        for item in listed.get("items") or []:
            if str(item.get("name") or "") == name:
                model_id = str(item.get("model_id") or item.get("id") or "")
                break
    if not model_id:
        raise RuntimeError(f"model create/lookup failed: {code} {body}")
    ver_code, ver_body = req(
        "POST",
        f"/v1/tenants/{TENANT}/projects/{PROJECT}/models/{model_id}/versions",
        token,
        {
            "run_id": run_id,
            "artifact_uri": f"s3://mlair/demo/models/{name}/{run_id}",
            "description": "From seed_demo",
            "stage": "staging",
        },
    )
    if ver_code not in {200, 201}:
        print(f"[WARN] model version: {ver_code} {ver_body}")
    else:
        print(f"[OK] model version for {name}")
    return model_id


def main() -> int:
    require_api_reachable(BASE)
    token = resolve_smoke_bearer_token("maintainer")
    tag = str(int(time.time() * 1000))
    is_external = external_mode(token)
    print(f"[INFO] execution_mode={'external' if is_external else 'internal'}")

    datasets_spec = [
        ("retail_shelf_v3", 120),
        ("defect_inspection_v2", 90),
        ("ops_telemetry_buffer", 60),
    ]
    created: dict[str, tuple[str, str]] = {}
    for name, rows in datasets_spec:
        ds_id, ver_id = ensure_dataset(token, name, rows)
        created[name] = (ds_id, ver_id)
        print(f"[OK] dataset {name}")

    primary = "retail_shelf_v3"
    dataset_id, dataset_version_id = created[primary]

    success_tasks = [
        {"id": "prepare", "plugin": "echo_tracking"},
        {"id": "train", "plugin": "echo_tracking", "depends_on": ["prepare"]},
        {"id": "evaluate", "plugin": "echo_tracking", "depends_on": ["train"]},
    ]
    fail_tasks = [
        {"id": "prepare", "plugin": "echo_tracking"},
        {"id": "train", "plugin": "echo_tracking", "depends_on": ["prepare"]},
    ]
    running_tasks = [
        {"id": "prepare", "plugin": "echo_tracking"},
        {"id": "train", "plugin": "echo_tracking", "depends_on": ["prepare"]},
        {"id": "evaluate", "plugin": "echo_tracking", "depends_on": ["train"]},
    ]

    ensure_pipeline(token, "demo_success_pipeline", primary, tasks=success_tasks)
    ensure_pipeline(token, "always_fail_demo_pipeline", primary, tasks=fail_tasks)
    ensure_pipeline(token, "demo_running_pipeline", primary, tasks=running_tasks)
    # Extra SUCCESS variant for compare UI
    ensure_pipeline(token, "demo_success_candidate_pipeline", primary, tasks=success_tasks)

    stop = threading.Event()
    drainer = None
    if is_external:
        drainer = threading.Thread(
            target=drain_worker,
            kwargs={
                "stop": stop,
                "token": token,
                "capabilities": ["echo_tracking"],
                "fail_pipeline_prefixes": ("always_fail",),
                "hold_pipeline_prefixes": ("demo_running",),
                "worker_id": "seed-demo-worker",
            },
            daemon=True,
        )
        drainer.start()

    try:
        # Trigger RUNNING first so hold_pipeline_prefixes applies before any lease completes it.
        running_id = trigger_run(
            token,
            pipeline_id="demo_running_pipeline",
            dataset_id=dataset_id,
            dataset_name=primary,
            dataset_version_id=dataset_version_id,
            label="running",
            tag=tag,
        )
        success_id = trigger_run(
            token,
            pipeline_id="demo_success_pipeline",
            dataset_id=dataset_id,
            dataset_name=primary,
            dataset_version_id=dataset_version_id,
            label="success",
            tag=tag,
        )
        candidate_id = trigger_run(
            token,
            pipeline_id="demo_success_candidate_pipeline",
            dataset_id=dataset_id,
            dataset_name=primary,
            dataset_version_id=dataset_version_id,
            label="success-candidate",
            tag=tag,
        )
        failed_id = trigger_run(
            token,
            pipeline_id="always_fail_demo_pipeline",
            dataset_id=dataset_id,
            dataset_name=primary,
            dataset_version_id=dataset_version_id,
            label="failed",
            tag=tag,
        )

        success_status = wait_terminal(success_id, token, 150)
        candidate_status = wait_terminal(candidate_id, token, 150)
        failed_status = wait_terminal(failed_id, token, 150)
        print(f"[OK] success run {success_id} → {success_status}")
        print(f"[OK] candidate run {candidate_id} → {candidate_status}")
        print(f"[OK] failed run {failed_id} → {failed_status}")
        print(f"[OK] running run {running_id} (intentionally left in-flight)")

        for rid, variant in (
            (success_id, "success"),
            (candidate_id, "success"),
            (failed_id, "failed"),
            (running_id, "running"),
        ):
            log_curve(token, rid, variant=variant)

        ingest_lineage(token, success_id, dataset_id, dataset_version_id, primary, tag, task_key="train")
        ingest_lineage(
            token, success_id, dataset_id, dataset_version_id, primary, f"{tag}-eval", task_key="evaluate"
        )
        ingest_lineage(token, candidate_id, dataset_id, dataset_version_id, primary, f"{tag}-c", task_key="train")

        # Cross-dataset lineage flavour (defect → derived artifact) via success evaluate task
        defect_id, defect_ver = created["defect_inspection_v2"]
        ingest_lineage(
            token,
            success_id,
            defect_id,
            defect_ver,
            "defect_inspection_v2",
            f"{tag}-defect",
            task_key="evaluate",
        )

        model_id = ensure_model(token, "shelf-detector", success_id)
        print(f"[OK] model shelf-detector id={model_id}")

        cmp_code, cmp_body = req(
            "POST",
            f"/v1/tenants/{TENANT}/projects/{PROJECT}/runs/compare",
            token,
            {"run_ids": [success_id, candidate_id], "baseline_run_id": success_id},
        )
        print(f"[OK] compare {cmp_code}" if cmp_code in {200, 201} else f"[WARN] compare {cmp_code} {cmp_body}")

        # Confirm held RUNNING is still not terminal
        _, running_body = req("GET", f"/v1/tenants/{TENANT}/projects/{PROJECT}/runs/{running_id}", token)
        running_status = str((running_body or {}).get("status") or "").upper()
        print(f"[OK] running status probe → {running_status}")

        # Second FAILED flavour for list density
        failed2 = trigger_run(
            token,
            pipeline_id="always_fail_demo_pipeline",
            dataset_id=dataset_id,
            dataset_name=primary,
            dataset_version_id=dataset_version_id,
            label="failed-retry",
            tag=f"{tag}b",
        )
        failed2_status = wait_terminal(failed2, token, 120)
        log_curve(token, failed2, variant="failed")
        print(f"[OK] failed-retry run {failed2} → {failed2_status}")

        out = {
            "status": "ok",
            "execution_mode": "external" if is_external else "internal",
            "datasets": {k: {"id": v[0], "version_id": v[1]} for k, v in created.items()},
            "runs": {
                "success": {"id": success_id, "status": success_status},
                "success_candidate": {"id": candidate_id, "status": candidate_status},
                "failed": {"id": failed_id, "status": failed_status},
                "failed_retry": {"id": failed2, "status": failed2_status},
                "running": {"id": running_id, "status": running_status or "RUNNING (held)"},
            },
            "model_id": model_id,
            "hub": {
                "login": f"{BASE}/login",
                "datasets": f"{BASE}/datasets",
                "dataset": f"{BASE}/datasets/{dataset_id}",
                "runs": f"{BASE}/runs",
                "run_success": f"{BASE}/runs/{success_id}",
                "run_failed": f"{BASE}/runs/{failed_id}",
                "run_running": f"{BASE}/runs/{running_id}",
                "models": f"{BASE}/models",
                "model": f"{BASE}/models/{model_id}",
                "lineage": f"{BASE}/lineage?run={success_id}",
                "compare": f"{BASE}/runs/compare?ids={success_id},{candidate_id}",
            },
            "screenshot_tips": [
                "Runs list: filter/sort to show SUCCESS / FAILED / RUNNING together",
                "Open success run → Metrics + Tasks timeline + Lineage tab",
                "Open failed run → error on train task (nan_loss_spike)",
                "Open running run → in-progress DAG (held by seed worker)",
                "Lineage deep-link from success run (dataset → model/eval artifacts)",
                "Dataset Hub retail_shelf_v3 → Versions / Run-Train",
                "Models → shelf-detector staging version from success run",
            ],
        }
        print(json.dumps(out, indent=2))
        ok = (
            success_status == "SUCCESS"
            and candidate_status == "SUCCESS"
            and failed_status == "FAILED"
            and running_status in {"RUNNING", "QUEUED", "PENDING"}
        )
        return 0 if ok else 1
    finally:
        stop.set()
        if drainer is not None:
            drainer.join(timeout=8)


if __name__ == "__main__":
    raise SystemExit(main())
