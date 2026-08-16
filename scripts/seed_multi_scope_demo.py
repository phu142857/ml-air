#!/usr/bin/env python3
"""Extra tenant/project scopes for Hub demo (embedded in ``seed_demo.py``).

  python scripts/seed_multi_scope_demo.py   # standalone
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
from collections import defaultdict
from pathlib import Path

_scripts = Path(__file__).resolve().parent
if str(_scripts) not in sys.path:
    sys.path.insert(0, str(_scripts))
from identity_smoke_token import clear_smoke_token_cache, resolve_smoke_bearer_token  # noqa: E402
from smoke_common import require_api_reachable  # noqa: E402

BASE = os.getenv("ML_AIR_BASE_URL", "http://localhost:8080").rstrip("/")

# tenant_id, project_id, display_name
DEMO_SCOPES: tuple[tuple[str, str, str], ...] = (
    ("retail", "vision-qa", "Retail Vision QA"),
    ("retail", "forecast", "Retail Forecast"),
    ("healthcare", "radiology", "Healthcare Radiology"),
    ("healthcare", "trials", "Clinical Trials"),
    ("manufacturing", "qc-line", "Manufacturing QC"),
    ("manufacturing", "defect-hub", "Defect Hub"),
)

DEMO_VIEWER_USERNAME = os.getenv("ML_AIR_DEMO_SCOPE_USERNAME", "scope-demo").strip()
DEMO_VIEWER_PASSWORD = os.getenv("ML_AIR_DEMO_SCOPE_PASSWORD", "scope-demo-change-me").strip()


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


def register_scope(token: str, tenant_id: str, project_id: str, name: str) -> None:
    code, body = req(
        "POST",
        f"/v1/tenants/{tenant_id}/projects/registry",
        token,
        {"project_id": project_id, "name": name},
    )
    if code in {200, 201}:
        print(f"[OK] registered {tenant_id}/{project_id}")
        return
    detail = str(body.get("detail") or body)
    if code == 400 and "exists" in detail.lower():
        print(f"[SKIP] {tenant_id}/{project_id} already registered")
        return
    raise RuntimeError(f"register {tenant_id}/{project_id}: {code} {body}")


def seed_scope_data(tenant_id: str, project_id: str) -> int:
    env = os.environ.copy()
    env["ML_AIR_TENANT_ID"] = tenant_id
    env["ML_AIR_PROJECT_ID"] = project_id
    env["SEED_DEMO_LIGHT"] = "1"
    env["SEED_DEMO_SKIP_MULTI_SCOPES"] = "1"
    env["SEED_DEMO_WORKER_ID"] = f"seed-demo-worker-{tenant_id}-{project_id}"
    script = _scripts / "seed_demo.py"
    print(f"[INFO] seeding demo data for {tenant_id}/{project_id}")
    proc = subprocess.run([sys.executable, str(script)], env=env, check=False)
    if proc.returncode != 0:
        print(f"[WARN] seed_demo light failed for {tenant_id}/{project_id} (exit {proc.returncode})", file=sys.stderr)
        return int(proc.returncode)
    return 0


def ensure_demo_viewer(token: str) -> None:
    if not DEMO_VIEWER_USERNAME:
        return
    code, users = req("GET", "/v1/users?limit=200", token)
    if code != 200:
        print(f"[WARN] list users: {code} {users}")
        return
    user_id = None
    for row in users.get("items") or []:
        if str(row.get("username") or "") == DEMO_VIEWER_USERNAME:
            user_id = str(row.get("id") or "")
            break
    if not user_id:
        code, created = req(
            "POST",
            "/v1/users",
            token,
            {
                "username": DEMO_VIEWER_USERNAME,
                "password": DEMO_VIEWER_PASSWORD,
                "state": "active",
                "is_global_admin": False,
            },
        )
        if code not in {200, 201}:
            print(f"[WARN] create demo viewer: {code} {created}")
            return
        user_id = str(created.get("id") or "")
        print(f"[OK] created demo viewer {DEMO_VIEWER_USERNAME}")

    by_tenant: dict[str, list[str]] = defaultdict(list)
    for tenant_id, project_id, _ in DEMO_SCOPES:
        by_tenant[tenant_id].append(project_id)

    assignments = [
        {
            "tenant_id": tenant,
            "role": "maintainer",
            "all_projects": False,
            "project_ids": sorted(set(projects)),
        }
        for tenant, projects in sorted(by_tenant.items())
    ]
    code, body = req(
        "PUT",
        f"/v1/users/{user_id}/assignments",
        token,
        {"assignments": assignments},
    )
    if code == 200:
        print(f"[OK] scope-demo assignments ({len(assignments)} tenants)")
    else:
        print(f"[WARN] scope-demo assignments: {code} {body}")


def seed_extra_scopes() -> int:
    """Register demo tenants/projects, seed light Hub data, create scope-demo user."""
    token = resolve_smoke_bearer_token("admin")

    for tenant_id, project_id, name in DEMO_SCOPES:
        register_scope(token, tenant_id, project_id, name)

    failed = 0
    for tenant_id, project_id, _ in DEMO_SCOPES:
        if seed_scope_data(tenant_id, project_id) != 0:
            failed += 1

    clear_smoke_token_cache()
    ensure_demo_viewer(resolve_smoke_bearer_token("admin"))

    summary = {
        "status": "ok" if failed == 0 else "partial",
        "scopes": [{"tenant_id": t, "project_id": p, "name": n} for t, p, n in DEMO_SCOPES],
        "demo_viewer": DEMO_VIEWER_USERNAME or None,
        "failed_scopes": failed,
    }
    print(json.dumps(summary, indent=2))
    return 1 if failed else 0


def main() -> int:
    require_api_reachable(BASE)
    return seed_extra_scopes()


if __name__ == "__main__":
    raise SystemExit(main())
