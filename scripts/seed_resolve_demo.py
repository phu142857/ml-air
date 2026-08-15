#!/usr/bin/env python3
"""Seed demo data for model-centric pipeline resolve (Hub train UI).

Creates:
  - Two pipelines (primary + alternate) with echo_tracking
  - Dataset + training policy (ready for Train)
  - Model A: mapped → resolve_demo_primary (auto in dropdown)
  - Model B: unmapped → operator must pick pipeline manually

Usage:
  ML_AIR_BASE_URL=http://localhost:8080 python scripts/seed_resolve_demo.py
  make seed-resolve-demo
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

PIPELINE_PRIMARY = "resolve_demo_primary"
PIPELINE_ALT = "resolve_demo_alt"
MODEL_MAPPED_NAME = "resolve-demo-mapped"
MODEL_UNMAPPED_NAME = "resolve-demo-unmapped"


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
    boundary = f"----mlairResolveDemo{uuid.uuid4().hex}"
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


def ensure_pipeline(token: str, pipeline_id: str, dataset_name: str, tag: str) -> None:
    code, body = req(
        "POST",
        f"/v1/tenants/{TENANT}/projects/{PROJECT}/pipelines/{pipeline_id}/versions",
        token,
        {
            "config": {
                "tasks": [{"id": "train", "plugin": "echo_tracking"}],
                "inputs": [{"dataset": dataset_name, "required_size": 50}],
                "seed_tag": tag,
            }
        },
    )
    if code != 200:
        raise RuntimeError(f"pipeline {pipeline_id}: {code} {body}")


def ensure_model(token: str, name: str) -> str:
    code, listed = req(
        "GET",
        f"/v1/tenants/{TENANT}/projects/{PROJECT}/models?limit=200",
        token,
    )
    if code == 200:
        for item in listed.get("items") or []:
            if isinstance(item, dict) and str(item.get("name") or "") == name:
                model_id = str(item.get("model_id") or item.get("id") or "")
                if model_id:
                    print(f"[SKIP] model {name} exists ({model_id})")
                    return model_id
    code, body = req(
        "POST",
        f"/v1/tenants/{TENANT}/projects/{PROJECT}/models",
        token,
        {"name": name, "description": "resolve demo — Hub pipeline dropdown"},
    )
    if code == 200 and body.get("model_id"):
        return str(body["model_id"])
    if code == 409:
        code2, listed2 = req(
            "GET",
            f"/v1/tenants/{TENANT}/projects/{PROJECT}/models?limit=200",
            token,
        )
        if code2 == 200:
            for item in listed2.get("items") or []:
                if isinstance(item, dict) and str(item.get("name") or "") == name:
                    model_id = str(item.get("model_id") or item.get("id") or "")
                    if model_id:
                        print(f"[SKIP] model {name} exists ({model_id})")
                        return model_id
    raise RuntimeError(f"create model {name}: {code} {body}")


def create_model(token: str, name: str) -> str:
    return ensure_model(token, name)


def set_mapping(token: str, model_id: str, pipeline_id: str) -> None:
    code, body = req(
        "PUT",
        f"/v1/tenants/{TENANT}/projects/{PROJECT}/models/{model_id}/pipeline-mapping",
        token,
        {"pipeline_id": pipeline_id},
    )
    if code != 200:
        raise RuntimeError(f"pipeline mapping: {code} {body}")


def main() -> int:
    require_api_reachable(BASE)
    tag = str(int(time.time()))
    maintainer = resolve_smoke_bearer_token("maintainer")

    dataset_name = f"resolve_demo_{tag}"
    rows = ["id,label,value"] + [f"{i},cat,{i % 10}" for i in range(120)]
    csv_bytes = ("\n".join(rows) + "\n").encode("utf-8")

    print(f"[INFO] Seeding resolve demo (tag={tag}) against {BASE}")
    try:
        code, up = req_multipart(
            f"/v1/tenants/{TENANT}/projects/{PROJECT}/datasets/upload",
            maintainer,
            {"dataset_name": dataset_name},
            csv_bytes,
            "v1.csv",
        )
        if code != 200:
            raise RuntimeError(f"dataset upload: {code} {up}")
        dataset_id = str(up.get("dataset_id") or "")
        version_id = str(up.get("version_id") or "")

        code, policy = req(
            "PUT",
            f"/v1/tenants/{TENANT}/projects/{PROJECT}/datasets/{dataset_id}/training-policies",
            maintainer,
            {
                "required_size": 50,
                "freshness_hours": 168,
                "trigger_mode": "manual",
            },
        )
        if code != 200:
            raise RuntimeError(f"training policy: {code} {policy}")
        policy_id = str(policy.get("policy_id") or "")

        ensure_pipeline(maintainer, PIPELINE_PRIMARY, dataset_name, tag)
        ensure_pipeline(maintainer, PIPELINE_ALT, dataset_name, tag)

        mapped_model_id = create_model(maintainer, MODEL_MAPPED_NAME)
        unmapped_model_id = create_model(maintainer, MODEL_UNMAPPED_NAME)
        set_mapping(maintainer, mapped_model_id, PIPELINE_PRIMARY)

        code, resolved = req(
            "GET",
            f"/v1/tenants/{TENANT}/projects/{PROJECT}/models/{mapped_model_id}/resolved-pipeline",
            maintainer,
        )
        if code != 200 or resolved.get("pipeline_id") != PIPELINE_PRIMARY:
            raise RuntimeError(f"resolved-pipeline mapped: {code} {resolved}")

        code, unresolved = req(
            "GET",
            f"/v1/tenants/{TENANT}/projects/{PROJECT}/models/{unmapped_model_id}/resolved-pipeline",
            maintainer,
        )
        if code != 200 or unresolved.get("pipeline_id"):
            raise RuntimeError(f"expected unresolved model: {code} {unresolved}")
    except Exception as exc:
        print(f"[FAIL] {exc}")
        return 1

    hub_dataset = f"{HUB}/datasets/{dataset_id}"
    out = {
        "status": "ok",
        "tag": tag,
        "tenant": TENANT,
        "project": PROJECT,
        "pipelines": {
            "primary": PIPELINE_PRIMARY,
            "alternate": PIPELINE_ALT,
        },
        "dataset": {
            "dataset_id": dataset_id,
            "dataset_name": dataset_name,
            "version_id": version_id,
            "policy_id": policy_id,
            "hub_url": hub_dataset,
        },
        "models": {
            "mapped": {
                "name": MODEL_MAPPED_NAME,
                "model_id": mapped_model_id,
                "expected_resolve": PIPELINE_PRIMARY,
                "hub_url": f"{HUB}/models/{mapped_model_id}",
            },
            "unmapped": {
                "name": MODEL_UNMAPPED_NAME,
                "model_id": unmapped_model_id,
                "expected_resolve": None,
                "hub_url": f"{HUB}/models/{unmapped_model_id}",
            },
        },
        "try_in_hub": [
            f"Open {hub_dataset} → Run / Train",
            f"Model '{MODEL_MAPPED_NAME}': pipeline dropdown should default to {PIPELINE_PRIMARY} (auto · mapping)",
            f"Model '{MODEL_UNMAPPED_NAME}': pick {PIPELINE_PRIMARY} or {PIPELINE_ALT} manually",
            f"Model page → {MODEL_MAPPED_NAME} → Overview → Default training pipeline card",
            "Optional: check 'Save as default' when overriding pipeline on train",
        ],
    }
    print(json.dumps(out, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
