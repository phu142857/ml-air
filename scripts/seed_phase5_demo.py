#!/usr/bin/env python3
"""Seed demo data for Phase 5 smart MLOps (compare, metrics, drift, export).

Requires a running MLAir API (e.g. all-in-one on :8080).

  ML_AIR_BASE_URL=http://localhost:8080 python scripts/seed_phase5_demo.py
  make seed-phase5-demo
"""

from __future__ import annotations

import json
import os
import sys
import time
import uuid
import urllib.error
import urllib.request
from pathlib import Path

_scripts = Path(__file__).resolve().parent
if str(_scripts) not in sys.path:
    sys.path.insert(0, str(_scripts))
from smoke_common import require_api_reachable  # noqa: E402
from identity_smoke_token import resolve_smoke_bearer_token  # noqa: E402

BASE = os.getenv("ML_AIR_BASE_URL", "http://localhost:8080").rstrip("/")
TENANT = os.getenv("ML_AIR_TENANT_ID", "default")
PROJECT = os.getenv("ML_AIR_PROJECT_ID", "default_project")
HUB = os.getenv("ML_AIR_HUB_URL", BASE).rstrip("/")


def req(method: str, path: str, token: str, body: dict | None = None) -> tuple[int, dict]:
    headers: dict[str, str] = {"Authorization": f"Bearer {token}"}
    data = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode("utf-8")
    request = urllib.request.Request(url=f"{BASE}{path}", method=method, headers=headers, data=data)
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


def req_multipart(path: str, token: str, fields: dict[str, str], file_bytes: bytes, filename: str) -> tuple[int, dict]:
    boundary = f"----mlairPhase5{uuid.uuid4().hex}"
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
    body = b"".join(parts)
    request = urllib.request.Request(
        url=f"{BASE}{path}",
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        },
        data=body,
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as resp:
            payload = resp.read().decode("utf-8")
            return resp.getcode(), json.loads(payload or "{}")
    except urllib.error.HTTPError as exc:
        payload = exc.read().decode("utf-8")
        try:
            return exc.code, json.loads(payload)
        except Exception:
            return exc.code, {"raw": payload}


def wait_run_terminal(run_id: str, viewer_token: str, timeout_s: int = 90) -> str:
    path = f"/v1/tenants/{TENANT}/projects/{PROJECT}/runs/{run_id}"
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        code, body = req("GET", path, viewer_token)
        if code == 200:
            status = str(body.get("status") or "").upper()
            if status in {"SUCCESS", "FAILED", "CANCELLED"}:
                return status
        time.sleep(0.75)
    return "TIMEOUT"


def ensure_demo_pipeline(maintainer_token: str, tag: str, dataset_name: str) -> None:
    code, body = req(
        "POST",
        f"/v1/tenants/{TENANT}/projects/{PROJECT}/pipelines/demo_pipeline/versions",
        maintainer_token,
        {
            "config": {
                "tasks": [{"id": "train", "plugin": "echo_tracking"}],
                "inputs": [{"dataset": dataset_name, "required_size": 50}],
                "seed_tag": tag,
            }
        },
    )
    if code != 200:
        print(f"[WARN] pipeline version create: {code} {body}")


def trigger_run(
    maintainer_token: str,
    tag: str,
    label: str,
    *,
    dataset_id: str,
    dataset_name: str,
    dataset_version_id: str,
) -> str | None:
    code, body = req(
        "POST",
        f"/v1/tenants/{TENANT}/projects/{PROJECT}/runs",
        maintainer_token,
        {
            "pipeline_id": "demo_pipeline",
            "dataset_version_id": dataset_version_id,
            "idempotency_key": f"phase5-{label}-{tag}",
            "plugin_name": "echo_tracking",
            "use_latest_pipeline_version": True,
            "override_config": {
                "dataset_version_id": dataset_version_id,
                "inputs": [{"dataset": dataset_name, "required_size": 50}],
            },
            "context": {
                "dataset_id": dataset_id,
                "dataset_version_id": dataset_version_id,
                "params": {"demo": "phase5", "variant": label},
                "metrics": {"seed_score": {"step": 0, "value": 0.5}},
            },
        },
    )
    if code != 200:
        print(f"[FAIL] trigger run {label}: {code} {body}")
        return None
    return str(body.get("run_id") or "") or None


def log_training_curve(maintainer_token: str, run_id: str, *, regress: bool) -> None:
    req("POST", f"/v1/tenants/{TENANT}/projects/{PROJECT}/runs/{run_id}/params", maintainer_token, {"key": "framework", "value": "phase5-demo"})
    req("POST", f"/v1/tenants/{TENANT}/projects/{PROJECT}/runs/{run_id}/params", maintainer_token, {"key": "lr", "value": "0.001"})
    for step in range(1, 21):
        progress = step / 20.0
        if regress:
            loss = 0.15 + progress * 0.35
            accuracy = 0.92 - progress * 0.18
            map_score = 0.88 - progress * 0.15
        else:
            loss = 0.9 * (0.82**step)
            accuracy = 0.55 + progress * 0.38
            map_score = 0.5 + progress * 0.42
        req(
            "POST",
            f"/v1/tenants/{TENANT}/projects/{PROJECT}/runs/{run_id}/metrics",
            maintainer_token,
            {"key": "loss", "value": round(loss, 5), "step": step},
        )
        req(
            "POST",
            f"/v1/tenants/{TENANT}/projects/{PROJECT}/runs/{run_id}/metrics",
            maintainer_token,
            {"key": "accuracy", "value": round(accuracy, 5), "step": step},
        )
        req(
            "POST",
            f"/v1/tenants/{TENANT}/projects/{PROJECT}/runs/{run_id}/metrics",
            maintainer_token,
            {"key": "mAP", "value": round(map_score, 5), "step": step},
        )


def seed_runs(
    maintainer_token: str,
    viewer_token: str,
    tag: str,
    *,
    dataset_id: str,
    dataset_name: str,
    dataset_version_id: str,
) -> dict[str, str]:
    ensure_demo_pipeline(maintainer_token, tag, dataset_name)
    baseline_id = trigger_run(
        maintainer_token,
        tag,
        "baseline",
        dataset_id=dataset_id,
        dataset_name=dataset_name,
        dataset_version_id=dataset_version_id,
    )
    candidate_id = trigger_run(
        maintainer_token,
        tag,
        "candidate",
        dataset_id=dataset_id,
        dataset_name=dataset_name,
        dataset_version_id=dataset_version_id,
    )
    if not baseline_id or not candidate_id:
        raise RuntimeError("failed to create demo runs")

    baseline_status = wait_run_terminal(baseline_id, viewer_token)
    candidate_status = wait_run_terminal(candidate_id, viewer_token)
    print(f"[INFO] baseline run {baseline_id} → {baseline_status}")
    print(f"[INFO] candidate run {candidate_id} → {candidate_status}")

    log_training_curve(maintainer_token, baseline_id, regress=False)
    log_training_curve(maintainer_token, candidate_id, regress=True)

    code, compare = req(
        "POST",
        f"/v1/tenants/{TENANT}/projects/{PROJECT}/runs/compare",
        viewer_token,
        {"run_ids": [baseline_id, candidate_id], "baseline_run_id": baseline_id},
    )
    if code != 200:
        print(f"[WARN] compare runs: {code} {compare}")
    else:
        regressions = 0
        for row in compare.get("runs") or []:
            regressions += len(row.get("regressions") or [])
        print(f"[OK] compare runs: baseline={compare.get('baseline_run_id')} regressions={regressions}")

    return {"baseline_run_id": baseline_id, "candidate_run_id": candidate_id}


def upload_dataset_v1(maintainer_token: str, tag: str) -> dict[str, str]:
    dataset_name = f"phase5_drift_demo_{tag}"
    rows_v1 = ["id,label,value"] + [f"{i},cat,{i % 10}" for i in range(120)]
    csv_v1 = ("\n".join(rows_v1) + "\n").encode("utf-8")

    code, up1 = req_multipart(
        f"/v1/tenants/{TENANT}/projects/{PROJECT}/datasets/upload",
        maintainer_token,
        {"dataset_name": dataset_name},
        csv_v1,
        "v1.csv",
    )
    if code != 200:
        raise RuntimeError(f"dataset upload v1 failed: {code} {up1}")
    dataset_id = str(up1.get("dataset_id") or "")
    version_v1 = str(up1.get("version_id") or "")

    code, _ = req(
        "PUT",
        f"/v1/tenants/{TENANT}/projects/{PROJECT}/datasets/{dataset_id}/versions/{version_v1}/quality-profile",
        maintainer_token,
        {
            "label_distribution": {"cat": 80, "dog": 20},
            "null_rate": 0.01,
            "sample_count": 120,
        },
    )
    if code != 200:
        raise RuntimeError(f"quality profile v1 failed: {code}")
    print(f"[OK] dataset v1 {dataset_name} ({version_v1[:8]}…)")
    return {
        "dataset_id": dataset_id,
        "dataset_name": dataset_name,
        "version_v1": version_v1,
    }


def complete_dataset_drift(
    maintainer_token: str,
    viewer_token: str,
    *,
    dataset_id: str,
    dataset_name: str,
    version_v1: str,
) -> dict[str, str]:
    rows_v2 = ["id,label,value"] + [f"{i},dog,{i % 10}" for i in range(120)]
    csv_v2 = ("\n".join(rows_v2) + "\n").encode("utf-8")

    code, up2 = req_multipart(
        f"/v1/tenants/{TENANT}/projects/{PROJECT}/datasets/upload",
        maintainer_token,
        {"dataset_name": dataset_name},
        csv_v2,
        "v2.csv",
    )
    if code != 200:
        raise RuntimeError(f"dataset upload v2 failed: {code} {up2}")
    version_v2 = str(up2.get("version_id") or "")

    code, _ = req(
        "PUT",
        f"/v1/tenants/{TENANT}/projects/{PROJECT}/datasets/{dataset_id}/versions/{version_v2}/quality-profile",
        maintainer_token,
        {
            "label_distribution": {"cat": 15, "dog": 85},
            "null_rate": 0.02,
            "sample_count": 120,
        },
    )
    if code != 200:
        raise RuntimeError(f"quality profile v2 failed: {code}")

    code, diff = req(
        "GET",
        f"/v1/tenants/{TENANT}/projects/{PROJECT}/datasets/{dataset_id}/versions/diff?from={version_v1}&to={version_v2}",
        viewer_token,
    )
    psi = None
    if code == 200:
        psi = (diff.get("drift") or {}).get("psi")
        print(f"[OK] dataset drift PSI={psi}")

    code, policy = req(
        "PUT",
        f"/v1/tenants/{TENANT}/projects/{PROJECT}/datasets/{dataset_id}/training-policies",
        maintainer_token,
        {
            "required_size": 50,
            "freshness_hours": 168,
            "trigger_mode": "manual",
            "validation_rules": [{"type": "data_drift", "max_psi": 0.2}],
        },
    )
    if code != 200:
        print(f"[WARN] training policy: {code} {policy}")
    policy_id = str(policy.get("policy_id") or "") if code == 200 else ""

    readiness_path = (
        f"/v1/tenants/{TENANT}/projects/{PROJECT}/datasets/{dataset_id}/readiness"
        f"?dataset_version_id={version_v2}&required_size=50"
    )
    if policy_id:
        readiness_path += f"&policy_id={policy_id}"
    code, readiness = req("GET", readiness_path, viewer_token)
    ready = readiness.get("ready") if code == 200 else None
    print(f"[INFO] readiness v2 ready={ready} (expect False when drift > 0.2)")

    return {
        "dataset_id": dataset_id,
        "dataset_name": dataset_name,
        "version_v1": version_v1,
        "version_v2": version_v2,
        "drift_psi": str(psi) if psi is not None else "",
    }


def main() -> int:
    require_api_reachable(BASE)
    tag = str(int(time.time()))
    maintainer = resolve_smoke_bearer_token("maintainer")
    viewer = resolve_smoke_bearer_token("viewer")

    print(f"[INFO] Seeding Phase 5 demo (tag={tag}) against {BASE}")
    try:
        dataset_v1 = upload_dataset_v1(maintainer, tag)
        runs = seed_runs(
            maintainer,
            viewer,
            tag,
            dataset_id=dataset_v1["dataset_id"],
            dataset_name=dataset_v1["dataset_name"],
            dataset_version_id=dataset_v1["version_v1"],
        )
        dataset = complete_dataset_drift(
            maintainer,
            viewer,
            dataset_id=dataset_v1["dataset_id"],
            dataset_name=dataset_v1["dataset_name"],
            version_v1=dataset_v1["version_v1"],
        )
        dataset = {**dataset_v1, **dataset}
    except Exception as exc:
        print(f"[FAIL] {exc}")
        return 1

    out = {
        "status": "ok",
        "tag": tag,
        "hub": {
            "runs_compare": f"{HUB}/runs",
            "baseline_run": f"{HUB}/runs/{runs['baseline_run_id']}",
            "candidate_run": f"{HUB}/runs/{runs['candidate_run_id']}",
            "dataset": f"{HUB}/datasets/{dataset['dataset_id']}",
        },
        **runs,
        **dataset,
        "try": [
            "Runs → select baseline + candidate → Compare runs",
            "Open baseline run → Metrics tab (charts + export CSV)",
            f"Dataset → Versions → compare {dataset['version_v1'][:8]}… vs {dataset['version_v2'][:8]}…",
            "Dataset → Readiness on v2 should show data_drift blocked",
        ],
    }
    print(json.dumps(out, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
