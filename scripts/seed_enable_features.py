#!/usr/bin/env python3
"""Enable Hub L4 feature flags for full demo surfaces (projections, governance, distributed).

  mlair seed  (first step in the seed pipeline)
  python scripts/seed_enable_features.py
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

_scripts = Path(__file__).resolve().parent
if str(_scripts) not in sys.path:
    sys.path.insert(0, str(_scripts))
from identity_smoke_token import resolve_smoke_bearer_token  # noqa: E402
from seed_env_utils import restart_mlair_service, sync_demo_feature_env, wait_for_health  # noqa: E402
from smoke_common import require_api_reachable  # noqa: E402

BASE = os.getenv("ML_AIR_BASE_URL", "http://localhost:8080").rstrip("/")

_DEMO_FEATURES: dict[str, bool] = {
    "dataset_hub_v2": True,
    "serving_slots_http": True,
    "otel_enabled": True,
    "projections_enabled": True,
    "timeline_projection_reads": True,
    "dashboard_projection_reads": True,
    "notification_delivery": True,
    "integration_delivery": True,
    "event_retention_enabled": True,
    "siem_export_enabled": True,
    "event_schema_registry_enabled": True,
    "multi_cluster": True,
    "multi_region": True,
    "federation": True,
    "edge_deployment": True,
    "global_scheduler": True,
    "cross_region_replication": True,
    "disaster_recovery": True,
    "global_identity": True,
    "global_observability": True,
    "extension_platform": True,
    "domain_event_outbox": True,
    "domain_webhook_delivery": False,
}


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


def _verify_distributed(token: str) -> bool:
    code, body = req("GET", "/v1/distributed/regions", token)
    if code == 200:
        print(f"[OK] distributed regions API enabled ({len(body.get('items') or [])} regions)")
        return True
    print(f"[FAIL] distributed regions API: {code} {body}", file=sys.stderr)
    return False


def main() -> int:
    require_api_reachable(BASE)
    token = resolve_smoke_bearer_token("admin")
    code, body = req("PATCH", "/v1/system/settings", token, {"features": _DEMO_FEATURES})
    if code != 200:
        print(f"[FAIL] enable features (L4): {code} {body}", file=sys.stderr)
        return 1
    print("[OK] enabled demo feature flags via L4 system settings")

    env_path = sync_demo_feature_env()
    print(f"[OK] synced demo feature env flags in {env_path}")

    if restart_mlair_service() != 0:
        print("[WARN] could not restart mlair container — distributed flags may stay off", file=sys.stderr)
    elif not wait_for_health(BASE):
        print("[FAIL] API did not become healthy after restart", file=sys.stderr)
        return 1
    else:
        print("[OK] API healthy after restart")
        token = resolve_smoke_bearer_token("admin")

    code, runtime = req("GET", "/v1/runtime-config", token)
    if code == 200:
        rf = runtime.get("features") or {}
        for key in ("multi_cluster", "multi_region", "global_observability", "projections_enabled"):
            print(f"[INFO] runtime-config.features.{key}={rf.get(key)}")

    if not _verify_distributed(token):
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
