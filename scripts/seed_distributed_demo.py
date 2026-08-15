#!/usr/bin/env python3
"""Seed Phase 6 distributed demo: regions, clusters, federation, edge, scheduler, replication, DR.

Populates /global and /clusters Hub pages. Run after seed_enable_features.py.

  python scripts/seed_distributed_demo.py
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
from smoke_common import require_api_reachable  # noqa: E402

BASE = os.getenv("ML_AIR_BASE_URL", "http://localhost:8080").rstrip("/")
TENANT = os.getenv("ML_AIR_TENANT_ID", "default")
PROJECT = os.getenv("ML_AIR_PROJECT_ID", "default_project")
HUB = os.getenv("ML_AIR_HUB_URL", BASE).rstrip("/")

_DEMO_REGIONS = (
    ("vn-hanoi", "Vietnam (Hanoi)", 1.0, 25),
    ("ap-singapore", "Singapore", 0.95, 35),
    ("us-virginia", "US East (Virginia)", 0.85, 220),
)

_DEMO_CLUSTERS = (
    ("demo-cluster-vn", "vn-hanoi", "http://vn.mlair-demo.local:8080", {"env": "demo", "tier": "gpu"}, {"gpu_available": 4, "cpu_cores_available": 32}),
    ("demo-cluster-apac", "ap-singapore", "http://apac.mlair-demo.local:8080", {"env": "demo", "tier": "cpu"}, {"gpu_available": 0, "cpu_cores_available": 64}),
    ("demo-cluster-us", "us-virginia", "http://us.mlair-demo.local:8080", {"env": "demo", "tier": "gpu"}, {"gpu_available": 8, "cpu_cores_available": 48}),
)


def req(method: str, path: str, token: str | None = None, body: dict | None = None) -> tuple[int, dict]:
    headers: dict[str, str] = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
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


def _items(body: dict) -> list[dict]:
    raw = body.get("items", [])
    return [x for x in raw if isinstance(x, dict)]


def _region_by_code(regions: list[dict], code: str) -> dict | None:
    for region in regions:
        if str(region.get("code") or "") == code:
            return region
    return None


def ensure_regions(token: str) -> dict[str, str]:
    code, body = req("GET", "/v1/distributed/regions", token)
    if code == 503:
        raise RuntimeError("multi_region_disabled — run seed_enable_features first")
    if code != 200:
        raise RuntimeError(f"list regions failed: {code} {body}")
    existing = _items(body)
    out: dict[str, str] = {str(r.get("code")): str(r.get("region_id")) for r in existing if r.get("code")}
    for code, name, weight, latency in _DEMO_REGIONS:
        if code in out:
            continue
        rc, created = req(
            "POST",
            "/v1/distributed/regions",
            token,
            {
                "code": code,
                "name": name,
                "preference_weight": weight,
                "latency_ms_hint": latency,
            },
        )
        if rc != 200:
            raise RuntimeError(f"register region {code}: {rc} {created}")
        out[code] = str(created.get("region_id"))
        print(f"[OK] region {name} ({code})")
    return out


def ensure_clusters(token: str, region_ids: dict[str, str]) -> list[dict]:
    code, body = req("GET", "/v1/distributed/clusters", token)
    if code == 503:
        raise RuntimeError("multi_cluster_disabled — run seed_enable_features first")
    if code != 200:
        raise RuntimeError(f"list clusters failed: {code} {body}")
    existing_by_name = {str(c.get("name")): c for c in _items(body)}
    created_clusters: list[dict] = []
    for name, region_code, endpoint, labels, capacity in _DEMO_CLUSTERS:
        if name in existing_by_name:
            created_clusters.append(existing_by_name[name])
            print(f"[SKIP] cluster {name} exists")
            continue
        region_id = region_ids.get(region_code)
        if not region_id:
            raise RuntimeError(f"missing region_id for {region_code}")
        rc, cluster = req(
            "POST",
            "/v1/distributed/clusters",
            token,
            {
                "region_id": region_id,
                "name": name,
                "api_endpoint": endpoint,
                "labels": labels,
                "capacity": capacity,
            },
        )
        if rc != 200:
            raise RuntimeError(f"register cluster {name}: {rc} {cluster}")
        agent_token = str(cluster.get("agent_token") or "")
        cluster_id = str(cluster.get("cluster_id") or "")
        hb_code, hb = req(
            "POST",
            f"/v1/distributed/clusters/{cluster_id}/heartbeat",
            None,
            {
                "agent_token": agent_token,
                "capacity": capacity,
                "health_status": "healthy",
            },
        )
        if hb_code != 200:
            print(f"[WARN] heartbeat {name}: {hb_code} {hb}")
        else:
            print(f"[OK] cluster {name} + heartbeat")
        created_clusters.append(cluster)
    return created_clusters


def seed_federation(token: str, region_ids: dict[str, str]) -> None:
    code, body = req("GET", "/v1/distributed/federations", token)
    if code == 503:
        print("[WARN] federation disabled")
        return
    if code != 200:
        print(f"[WARN] list federations: {code} {body}")
        return
    items = _items(body)
    if items:
        fed_id = str(items[0].get("federation_id") or "global")
    else:
        rc, fed = req(
            "POST",
            "/v1/distributed/federations",
            token,
            {"name": "Demo Federation", "scope": "global", "config": {"demo": True}},
        )
        if rc != 200:
            print(f"[WARN] create federation: {rc} {fed}")
            return
        fed_id = str(fed.get("federation_id"))
        print("[OK] federation created")
    vn_region = region_ids.get("vn-hanoi")
    if vn_region:
        rc, attached = req(
            "POST",
            f"/v1/distributed/federations/{fed_id}/regions",
            token,
            {"region_id": vn_region, "tenant_scope": TENANT, "policy_scope": {"demo": True}},
        )
        if rc == 200:
            print("[OK] federation region attach (vn-hanoi)")


def seed_edge_nodes(token: str, clusters: list[dict]) -> None:
    if not clusters:
        return
    cluster_id = str(clusters[0].get("cluster_id") or "")
    if not cluster_id:
        return
    rc, edge = req(
        "POST",
        "/v1/distributed/edge-nodes",
        token,
        {
            "cluster_id": cluster_id,
            "name": "demo-edge-factory-1",
            "deployment_kind": "factory",
            "sync_mode": "online",
            "config": {"line": "demo-assembly"},
        },
    )
    if rc != 200:
        print(f"[WARN] edge node: {rc} {edge}")
        return
    edge_id = str(edge.get("edge_id"))
    req("POST", f"/v1/distributed/edge-nodes/{edge_id}/sync", token, {"status": "synced"})
    print("[OK] edge node + sync")


def seed_scheduler_placement(token: str, region_ids: dict[str, str]) -> None:
    prefix = f"/v1/tenants/{TENANT}/projects/{PROJECT}"
    code, runs = req("GET", f"{prefix}/runs?limit=1", token)
    run_id = None
    if code == 200:
        items = _items(runs)
        if items:
            run_id = str(items[0].get("run_id") or items[0].get("id") or "")
    if not run_id:
        print("[WARN] no runs for scheduler placement — run seed_demo first")
        return
    vn = region_ids.get("vn-hanoi")
    rc, placement = req(
        "POST",
        "/v1/distributed/scheduler/place",
        token,
        {
            "run_id": run_id,
            "tenant_id": TENANT,
            "project_id": PROJECT,
            "gpu_required": True,
            "region_preference": vn,
            "cluster_labels": {"env": "demo"},
            "latency_budget_ms": 100,
        },
    )
    if rc != 200:
        print(f"[WARN] scheduler placement: {rc} {placement}")
    else:
        print(f"[OK] scheduler placement for run {run_id[:8]}…")


def seed_replication(token: str, region_ids: dict[str, str]) -> None:
    src = region_ids.get("vn-hanoi")
    dst = region_ids.get("ap-singapore")
    if not src or not dst:
        return
    rc, job = req(
        "POST",
        "/v1/distributed/replication/jobs",
        token,
        {
            "source_region_id": src,
            "target_region_id": dst,
            "resource_type": "model_registry",
            "resource_id": "demo-replication-model",
            "payload": {"demo": True},
        },
    )
    if rc != 200:
        print(f"[WARN] replication job: {rc} {job}")
        return
    job_id = str(job.get("job_id") or "")
    if job_id:
        req("POST", f"/v1/distributed/replication/jobs/{job_id}/run", token)
    print("[OK] replication job")


def seed_dr(token: str) -> None:
    rc, snap = req("POST", "/v1/distributed/dr/snapshots", token, {"scope": "global"})
    if rc != 200:
        print(f"[WARN] DR snapshot: {rc} {snap}")
        return
    snap_id = str(snap.get("snapshot_id") or "")
    if snap_id:
        req("POST", f"/v1/distributed/dr/snapshots/{snap_id}/restore?dry_run=true", token)
    print("[OK] DR snapshot (dry-run restore)")


def seed_identity_trust(token: str) -> None:
    rc, trust = req(
        "POST",
        "/v1/distributed/identity/trusts",
        token,
        {
            "source_domain": "demo-vn.mlair.local",
            "target_domain": "demo-global.mlair.local",
            "trust_kind": "federation",
            "config": {"demo": True},
            "enabled": True,
        },
    )
    if rc != 200:
        print(f"[WARN] identity trust: {rc} {trust}")
    else:
        print("[OK] global identity trust")


def seed_extension(token: str) -> None:
    rc, ext = req(
        "POST",
        "/v1/distributed/extensions",
        token,
        {
            "point_type": "plugin",
            "name": "demo-custom-plugin",
            "version": "0.1.0",
            "entrypoint": "sdk.plugin_contract:PluginContract",
            "config": {"demo": True},
            "enabled": True,
        },
    )
    if rc != 200:
        print(f"[WARN] extension register: {rc} {ext}")
    else:
        print("[OK] extension platform entry")


def verify_global_dashboard(token: str) -> None:
    code, dash = req("GET", "/v1/distributed/observability/global", token)
    if code != 200:
        print(f"[WARN] global dashboard: {code} {dash}")
        return
    regions = (dash.get("regions") or {}).get("total", 0)
    clusters = (dash.get("clusters") or {}).get("total", 0)
    print(f"[OK] global dashboard regions={regions} clusters={clusters}")


def main() -> int:
    require_api_reachable(BASE)
    token = resolve_smoke_bearer_token("maintainer")
    print(f"[INFO] seeding distributed demo against {BASE}")
    try:
        region_ids = ensure_regions(token)
        clusters = ensure_clusters(token, region_ids)
        seed_federation(token, region_ids)
        seed_edge_nodes(token, clusters)
        seed_scheduler_placement(token, region_ids)
        seed_replication(token, region_ids)
        seed_dr(token)
        seed_identity_trust(token)
        seed_extension(token)
        verify_global_dashboard(token)
    except Exception as exc:
        print(f"[FAIL] {exc}", file=sys.stderr)
        return 1

    out = {
        "status": "ok",
        "hub": {"global": f"{HUB}/global", "clusters": f"{HUB}/clusters"},
        "regions": list(region_ids.keys()),
        "clusters": [c.get("name") for c in clusters if c.get("name")],
    }
    print(json.dumps(out, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
