#!/usr/bin/env python3
"""Seed demo data for sprint MLOps features (Phases I–III + experiments).

Requires hub seed (models/runs) and a running API.

  python scripts/seed_mlops_features_demo.py
  mlair seed mlops   # via seed pipeline
"""

from __future__ import annotations

import json
import os
import sys
import threading
import time
import urllib.error
import urllib.parse
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
HUB = os.getenv("ML_AIR_HUB_URL", BASE).rstrip("/")

EXPERIMENT_NAME = "yolov8-baseline-demo"
MODEL_PREF_NAMES = ("shelf-detector", "mlops-governance-demo")


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


def prefix() -> str:
    return f"/v1/tenants/{TENANT}/projects/{PROJECT}"


def resolve_actor_id(token: str) -> str:
    code, me = req("GET", "/v1/auth/me", token)
    if code == 200:
        uid = str(me.get("user_id") or me.get("id") or "").strip()
        if uid:
            return uid
    code, users = req("GET", "/v1/identity/users?limit=20", token)
    if code == 200:
        for item in users.get("items") or []:
            if isinstance(item, dict):
                uid = str(item.get("id") or item.get("user_id") or "").strip()
                if uid:
                    return uid
    raise RuntimeError("no identity user found for stakeholder seed — log in via Identity first")


def resolve_stakeholder_assignments(token: str, actor_id: str) -> list[dict[str, str]]:
    """Build stakeholder rows using real user IDs (FK to users table)."""
    code, users = req("GET", "/v1/identity/users?limit=20", token)
    ids: list[str] = []
    if code == 200:
        for item in users.get("items") or []:
            if isinstance(item, dict):
                uid = str(item.get("id") or item.get("user_id") or "").strip()
                if uid and uid not in ids:
                    ids.append(uid)
    if actor_id not in ids:
        ids.insert(0, actor_id)
    if not ids:
        raise RuntimeError("no users available for stakeholders")

    executor_id = ids[1] if len(ids) > 1 else ids[0]
    return [
        {"user_id": ids[0], "role": "owner"},
        {"user_id": ids[0], "role": "reviewer"},
        {"user_id": ids[0], "role": "approver"},
        {"user_id": executor_id, "role": "executor"},
    ]


def resolve_dataset_version(token: str, *, preferred_name: str = "retail_shelf_v3") -> tuple[str, str, str] | None:
    cursor: str | None = None
    candidates: list[tuple[str, str]] = []
    for _ in range(8):
        path = f"{prefix()}/datasets?limit=50"
        if cursor:
            path += f"&cursor={urllib.parse.quote(cursor)}"
        code, page = req("GET", path, token)
        if code != 200:
            break
        for item in page.get("items") or []:
            if not isinstance(item, dict):
                continue
            name = str(item.get("name") or "")
            dataset_id = str(item.get("dataset_id") or "").strip()
            if dataset_id:
                candidates.append((name, dataset_id))
        if not page.get("has_more"):
            break
        cursor = str(page.get("next_cursor") or "") or None
        if not cursor:
            break

    ordered = sorted(candidates, key=lambda x: (0 if x[0] == preferred_name else 1, x[0]))
    for name, dataset_id in ordered:
        code, versions = req("GET", f"{prefix()}/datasets/{dataset_id}/versions", token)
        if code != 200:
            continue
        items = versions.get("items") or []
        if not items:
            continue
        version_id = str((items[0] if isinstance(items[0], dict) else {}).get("version_id") or "").strip()
        if version_id:
            return name, dataset_id, version_id
    return None


def find_model(token: str, names: tuple[str, ...] = MODEL_PREF_NAMES) -> tuple[str, str] | None:
    code, listed = req("GET", f"{prefix()}/models?limit=200", token)
    if code != 200:
        return None
    by_name = {str(i.get("name") or ""): str(i.get("model_id") or i.get("id") or "") for i in (listed.get("items") or []) if isinstance(i, dict)}
    for name in names:
        mid = by_name.get(name, "").strip()
        if mid:
            return name, mid
    return None


def ensure_model(token: str, name: str) -> str:
    found = find_model(token, (name,))
    if found:
        print(f"[SKIP] model {name} exists ({found[1]})")
        return found[1]
    code, body = req("POST", f"{prefix()}/models", token, {"name": name, "description": "MLOps sprint demo model"})
    if code in (200, 201) and body.get("model_id"):
        return str(body["model_id"])
    raise RuntimeError(f"create model {name}: {code} {body}")


def ensure_model_version(token: str, model_id: str, *, run_id: str | None = None) -> int:
    code, listed = req("GET", f"{prefix()}/models/{model_id}/versions", token)
    versions = []
    if code == 200:
        versions = [int(v.get("version")) for v in (listed.get("items") or []) if isinstance(v, dict) and v.get("version")]
    if versions:
        return max(versions)
    code, body = req(
        "POST",
        f"{prefix()}/models/{model_id}/versions",
        token,
        {"run_id": run_id, "artifact_uri": f"s3://mlair/demo/mlops/{model_id}/v1", "stage": "staging"},
    )
    if code not in (200, 201):
        raise RuntimeError(f"model version: {code} {body}")
    return int(body.get("version") or 1)


def drain_worker(stop: threading.Event, token: str, *, seconds: float = 45.0) -> None:
    deadline = time.time() + seconds
    worker_id = "seed-mlops-worker"
    while not stop.is_set() and time.time() < deadline:
        code, lease = req(
            "POST",
            "/v1/tasks/lease",
            token,
            {"worker_id": worker_id, "capabilities": ["echo_tracking"], "max_tasks": 2},
        )
        if code != 200:
            time.sleep(0.5)
            continue
        for task in lease.get("tasks") or []:
            task_id = str(task.get("task_id") or "")
            run_id = str(task.get("run_id") or "")
            if not task_id:
                continue
            ctx = (task.get("payload") or {}).get("context") or task.get("context") or {}
            req(
                "POST",
                f"/v1/tasks/{task_id}/complete",
                token,
                {
                    "worker_id": worker_id,
                    "params": ctx.get("params") or {"seed": "mlops"},
                    "metrics": ctx.get("metrics") or {"accuracy": {"step": 1, "value": 0.91}},
                    "artifacts": [{"path": f"demo/{run_id}/model.pkl", "uri": f"s3://mlair/demo/{run_id}/model.pkl"}],
                },
            )
        if not (lease.get("tasks") or []):
            time.sleep(0.4)


def seed_experiment(token: str, tag: str) -> dict[str, str]:
    code, listed = req("GET", f"{prefix()}/experiments?limit=50", token)
    experiment_id = None
    if code == 200:
        for item in listed.get("items") or []:
            if isinstance(item, dict) and str(item.get("name") or "") == EXPERIMENT_NAME:
                experiment_id = str(item.get("experiment_id") or "")
                break
    if not experiment_id:
        code, body = req(
            "POST",
            f"{prefix()}/experiments",
            token,
            {"name": EXPERIMENT_NAME, "description": "Demo experiment — hyperparameter baseline sweep"},
        )
        if code not in (200, 201):
            raise RuntimeError(f"create experiment: {code} {body}")
        experiment_id = str(body.get("experiment_id") or "")
        print(f"[OK] experiment {EXPERIMENT_NAME}")
    else:
        print(f"[SKIP] experiment {EXPERIMENT_NAME} ({experiment_id})")

    code, ds_list = req("GET", f"{prefix()}/datasets?limit=5", token)
    dataset_version_id = None
    dataset_id = None
    dataset_name = "retail_shelf_v3"
    anchor = resolve_dataset_version(token)
    if anchor:
        dataset_name, dataset_id, dataset_version_id = anchor
        print(f"[INFO] experiment runs use dataset {dataset_name} ({dataset_id[:8]}…)")
    else:
        print("[WARN] no dataset version found — experiment runs may be skipped")

    run_ids: list[str] = []
    stop = threading.Event()
    worker = threading.Thread(target=drain_worker, args=(stop, token), kwargs={"seconds": 50.0}, daemon=True)
    worker.start()
    try:
        for label in ("baseline", "candidate"):
            body: dict = {
                "pipeline_id": "demo_pipeline",
                "idempotency_key": f"mlops-exp-{label}-{tag}",
                "experiment_id": experiment_id,
                "plugin_name": "echo_tracking",
            }
            if dataset_version_id:
                body["dataset_version_id"] = dataset_version_id
                body["override_config"] = {
                    "dataset_version_id": dataset_version_id,
                    "inputs": [{"dataset": dataset_name, "required_size": 20}],
                }
            code, run = req("POST", f"{prefix()}/runs", token, body)
            if code == 200 and run.get("run_id"):
                run_ids.append(str(run["run_id"]))
                print(f"[OK] experiment run {label}: {run['run_id']}")
            else:
                print(f"[WARN] experiment run {label}: {code} {run}")
        time.sleep(2.0)
    finally:
        stop.set()
        worker.join(timeout=5.0)

    return {"experiment_id": experiment_id, "run_ids": ",".join(run_ids)}


def seed_stakeholders(token: str, model_id: str, actor_id: str) -> None:
    assignments = resolve_stakeholder_assignments(token, actor_id)
    code, body = req(
        "PUT",
        f"{prefix()}/models/{model_id}/stakeholders",
        token,
        {"items": assignments},
    )
    if code != 200:
        print(f"[WARN] stakeholders: {code} {body}")
    else:
        print(f"[OK] stakeholders ({len(body.get('items') or [])} roles)")


def seed_evaluations(token: str, model_id: str, version: int) -> None:
    code, passed = req(
        "POST",
        f"{prefix()}/models/{model_id}/versions/{version}/evaluations/evaluate",
        token,
        {
            "metrics": {"accuracy": 0.94, "f1": 0.91},
            "gates": {"accuracy": {"min": 0.9}, "f1": {"min": 0.85}},
            "benchmark_name": "holdout-v1",
            "source": "seed_demo",
        },
    )
    if code == 200:
        print(f"[OK] evaluation v{version} passed ({passed.get('status')})")
    else:
        print(f"[WARN] evaluation pass v{version}: {code} {passed}")

    code, failed = req(
        "POST",
        f"{prefix()}/models/{model_id}/versions/{version}/evaluations",
        token,
        {
            "status": "failed",
            "metrics": {"accuracy": 0.72},
            "benchmark_name": "stress-test",
            "source": "seed_demo",
            "reasons": [{"type": "below_min", "metric": "accuracy", "min": 0.9, "actual": 0.72}],
        },
    )
    if code in (200, 201):
        print(f"[OK] evaluation stress-test recorded (failed)")
    else:
        print(f"[WARN] evaluation failed record: {code} {failed}")


def seed_closed_loop(token: str, model_id: str) -> None:
    code, policy = req(
        "PUT",
        f"{prefix()}/models/{model_id}/closed-loop-policy",
        token,
        {
            "monitoring_enabled": True,
            "auto_retrain_on_breach": False,
            "auto_promote_on_eval_pass": False,
            "auto_rollback_on_breach": True,
            "drift_psi_threshold": 0.2,
        },
    )
    if code != 200:
        print(f"[WARN] closed-loop policy: {code} {policy}")
    else:
        print("[OK] closed-loop policy")

    code, slo = req(
        "PUT",
        f"{prefix()}/models/{model_id}/slo-rules",
        token,
        {
            "items": [
                {"metric_key": "accuracy", "operator": "gte", "threshold": 0.85, "severity": "critical"},
                {"metric_key": "latency_ms", "operator": "lte", "threshold": 200.0, "severity": "warning"},
            ]
        },
    )
    if code != 200:
        print(f"[WARN] SLO rules: {code} {slo}")
    else:
        print(f"[OK] SLO rules ({len(slo.get('items') or [])})")

    code, ingest = req(
        "POST",
        f"{prefix()}/models/{model_id}/production-metrics",
        token,
        {
            "samples": [
                {"metric_key": "accuracy", "value": 0.78},
                {"metric_key": "latency_ms", "value": 145.0},
            ],
            "source": "seed_demo",
        },
    )
    if code not in (200, 201):
        print(f"[WARN] production metrics ingest: {code} {ingest}")
    else:
        print("[OK] production metrics ingested (accuracy below SLO)")

    code, ev = req("POST", f"{prefix()}/models/{model_id}/closed-loop/evaluate", token, {})
    if code == 200:
        actions = ev.get("actions") or []
        print(f"[OK] closed-loop evaluate ({len(actions)} action(s))")
    else:
        print(f"[WARN] closed-loop evaluate: {code} {ev}")

    code, events = req("GET", f"{prefix()}/models/{model_id}/closed-loop/events?limit=20", token)
    if code == 200:
        print(f"[OK] closed-loop events ({len(events.get('items') or [])})")
    else:
        print(f"[WARN] closed-loop events: {code} {events}")


def seed_trigger_policies(token: str, model_id: str) -> None:
    for mode in ("drift", "slo_breach"):
        code, body = req(
            "PUT",
            f"{prefix()}/models/{model_id}/trigger-policy",
            token,
            {"trigger_mode": mode, "debounce_minutes": 15},
        )
        if code == 200:
            print(f"[OK] trigger policy mode={mode}")
        else:
            print(f"[WARN] trigger policy {mode}: {code} {body}")
        code, preview = req("POST", f"{prefix()}/models/{model_id}/trigger-policy/preview", token, {})
        if code == 200:
            print(f"[INFO] trigger preview ({mode}): eligible={preview.get('eligible')}")
        else:
            print(f"[WARN] trigger preview {mode}: {code} {preview}")


def verify_surfaces(token: str, model_id: str, experiment_id: str) -> dict:
    out: dict = {}
    code, projection = req("GET", f"{prefix()}/lifecycle-projection", token)
    if code == 200:
        summary = projection.get("summary") or {}
        print(
            f"[OK] lifecycle projection models={summary.get('model_count')} "
            f"datasets={summary.get('dataset_count')} active_runs={summary.get('active_runs')}"
        )
        out["lifecycle_projection"] = True
    else:
        print(f"[WARN] lifecycle projection: {code} {projection}")
        out["lifecycle_projection"] = False

    code, queue = req("GET", f"{prefix()}/governance/approval-queue?limit=20", token)
    if code == 200:
        n = len(queue.get("items") or [])
        print(f"[OK] approval queue ({n} pending)")
        out["approval_queue_count"] = n
    else:
        print(f"[WARN] approval queue: {code} {queue}")

    code, recs = req("GET", f"{prefix()}/lifecycle/recommendations?model_id={model_id}", token)
    if code == 200:
        n = len(recs.get("recommendations") or [])
        print(f"[OK] lifecycle recommendations ({n})")
        out["recommendations_count"] = n
    else:
        print(f"[WARN] lifecycle recommendations: {code} {recs}")

    code, exp_runs = req("GET", f"{prefix()}/experiments/{experiment_id}/runs?limit=10", token)
    if code == 200:
        n = len(exp_runs.get("items") or [])
        print(f"[OK] experiment runs listed ({n})")
        out["experiment_runs_count"] = n
    else:
        print(f"[WARN] experiment runs: {code} {exp_runs}")

    code, evals = req("GET", f"{prefix()}/models/{model_id}/evaluations?limit=10", token)
    if code == 200:
        n = len(evals.get("items") or [])
        print(f"[OK] model evaluations listed ({n})")
        out["evaluations_count"] = n
    else:
        print(f"[WARN] model evaluations list: {code} {evals}")

    return out


def main() -> int:
    require_api_reachable(BASE)
    tag = str(int(time.time()))
    token = resolve_smoke_bearer_token("maintainer")
    actor_id = resolve_actor_id(token)

    print(f"[INFO] seeding MLOps sprint features (tag={tag}) tenant={TENANT} project={PROJECT}")
    try:
        found = find_model(token)
        if found:
            model_name, model_id = found
            print(f"[INFO] using model {model_name} ({model_id})")
        else:
            model_name = MODEL_PREF_NAMES[1]
            model_id = ensure_model(token, model_name)
            print(f"[OK] model {model_name} ({model_id})")

        version = ensure_model_version(token, model_id)
        seed_stakeholders(token, model_id, actor_id)
        seed_evaluations(token, model_id, version)
        seed_closed_loop(token, model_id)
        seed_trigger_policies(token, model_id)
        exp = seed_experiment(token, tag)
        checks = verify_surfaces(token, model_id, exp["experiment_id"])
    except Exception as exc:
        print(f"[FAIL] {exc}")
        return 1

    out = {
        "status": "ok",
        "tenant": TENANT,
        "project": PROJECT,
        "model_id": model_id,
        "model_name": model_name,
        "model_version": version,
        "experiment_id": exp["experiment_id"],
        "hub": {
            "experiments": f"{HUB}/experiments",
            "experiment_detail": f"{HUB}/experiments/{exp['experiment_id']}",
            "model": f"{HUB}/models/{model_id}",
            "lifecycle": f"{HUB}/lifecycle",
            "approvals": f"{HUB}/governance/approvals",
        },
        "checks": checks,
        "try": [
            f"Experiments → {EXPERIMENT_NAME}",
            f"Models → {model_name} → Evaluations / Stakeholders / Monitoring tabs",
            "Governance → Approval queue",
            "Lifecycle → projection panel",
            "Settings → Integrations (from governance seed)",
        ],
    }
    print(json.dumps(out, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
