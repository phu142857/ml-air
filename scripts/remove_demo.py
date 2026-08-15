#!/usr/bin/env python3
"""Remove demo resources created by ``mlair seed`` scripts (best-effort).

Deletes models and datasets whose names match known demo prefixes.
Pipelines and historical runs are left in place (no pipeline delete API).

  mlair remove demo
  python scripts/remove_demo.py
"""

from __future__ import annotations

import json
import os
import re
import sys
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

_DATASET_RE = re.compile(
    r"^(demo_|resolve_demo_|phase5_drift_demo_|metrics_demo_|demo-)",
    re.IGNORECASE,
)
_MODEL_RE = re.compile(
    r"(demo|resolve-demo|screenshot demo|seed_demo|phase5)",
    re.IGNORECASE,
)


def req(method: str, path: str, token: str) -> tuple[int, dict]:
    request = urllib.request.Request(
        url=f"{BASE}{path}",
        method=method,
        headers={"Authorization": f"Bearer {token}"},
    )
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


def _items(body: dict, key: str = "items") -> list[dict]:
    raw = body.get(key, [])
    return [x for x in raw if isinstance(x, dict)]


def main() -> int:
    require_api_reachable(BASE)
    token = resolve_smoke_bearer_token(BASE)
    if not token:
        print("[FAIL] no bearer token; set ML_AIR_TOKEN or bootstrap admin credentials", file=sys.stderr)
        return 1

    prefix = f"/v1/tenants/{TENANT}/projects/{PROJECT}"
    removed = 0
    skipped = 0

    code, body = req("GET", f"{prefix}/datasets", token)
    if code != 200:
        print(f"[FAIL] list datasets: {code} {body}", file=sys.stderr)
        return 1
    for ds in _items(body):
        name = str(ds.get("name") or ds.get("dataset_name") or "").strip()
        ds_id = str(ds.get("dataset_id") or ds.get("id") or "").strip()
        if not name or not _DATASET_RE.search(name):
            continue
        path = f"{prefix}/datasets/by-name/{urllib.parse.quote(name, safe='')}"
        dcode, dbody = req("DELETE", path, token)
        if dcode in (200, 204, 404):
            print(f"[OK] removed dataset {name}")
            removed += 1
        else:
            print(f"[WARN] dataset {name} ({ds_id}): {dcode} {dbody}")
            skipped += 1

    code, body = req("GET", f"{prefix}/models", token)
    if code != 200:
        print(f"[FAIL] list models: {code} {body}", file=sys.stderr)
        return 1
    for model in _items(body):
        name = str(model.get("name") or model.get("model_id") or "").strip()
        model_id = str(model.get("model_id") or model.get("id") or name).strip()
        if not model_id or not _MODEL_RE.search(name or model_id):
            continue
        dcode, dbody = req("DELETE", f"{prefix}/models/{urllib.parse.quote(model_id, safe='')}", token)
        if dcode in (200, 204, 404):
            print(f"[OK] removed model {model_id}")
            removed += 1
        else:
            print(f"[WARN] model {model_id}: {dcode} {dbody}")
            skipped += 1

    print(f"[INFO] removed={removed} skipped={skipped}")
    print("[INFO] demo pipelines/runs are not deleted (no pipeline delete API); re-seed is idempotent.")
    return 0 if skipped == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
