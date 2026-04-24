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

    request = urllib.request.Request(url=f"{BASE}{path}", method=method, headers=headers, data=data)
    try:
        with urllib.request.urlopen(request, timeout=8) as resp:
            payload = resp.read().decode("utf-8")
            return resp.getcode(), json.loads(payload or "{}")
    except urllib.error.HTTPError as exc:
        payload = exc.read().decode("utf-8")
        try:
            return exc.code, json.loads(payload or "{}")
        except Exception:
            return exc.code, {"raw": payload}


def main() -> int:
    results: list[tuple[str, bool, str]] = []
    tag = str(int(time.time() * 1000))

    def record(name: str, ok: bool, detail: str = "") -> None:
        results.append((name, ok, detail))

    c, b = req(
        "POST",
        f"/v1/tenants/{TENANT}/projects/{PROJECT}/models",
        "maintainer-token",
        {"name": f"smoke-model-{tag}", "description": "smoke model"},
    )
    model_id = b.get("model_id") if c == 200 else None
    record("create-model", c == 200 and bool(model_id), f"{c} {b}")

    c, b = req(
        "GET",
        f"/v1/tenants/{TENANT}/projects/{PROJECT}/models",
        "viewer-token",
    )
    items = b.get("items", []) if isinstance(b, dict) else []
    found = any(item.get("model_id") == model_id for item in items) if model_id else False
    record("list-models", c == 200 and found, f"{c} count={len(items)}")

    c, b = req(
        "POST",
        f"/v1/tenants/{TENANT}/projects/{PROJECT}/models/{model_id}/versions",
        "maintainer-token",
        {"artifact_uri": f"s3://mlair/smoke-model-{tag}/model.pkl", "stage": "staging"},
    )
    created_version = b.get("version") if c == 200 else None
    record("create-model-version", c == 200 and isinstance(created_version, int), f"{c} {b}")

    c, b = req(
        "GET",
        f"/v1/tenants/{TENANT}/projects/{PROJECT}/models/{model_id}/versions",
        "viewer-token",
    )
    v_items = b.get("items", []) if isinstance(b, dict) else []
    has_created_version = any(item.get("version") == created_version for item in v_items) if created_version else False
    record("list-model-versions", c == 200 and has_created_version, f"{c} count={len(v_items)}")

    c, b = req(
        "POST",
        f"/v1/tenants/{TENANT}/projects/{PROJECT}/models/{model_id}/promote",
        "maintainer-token",
        {"version": created_version, "stage": "production"},
    )
    record("promote-version-production", c == 200 and b.get("stage") == "production", f"{c} {b}")

    for name, ok, detail in results:
        print(f"[{'PASS' if ok else 'FAIL'}] {name} :: {detail}")
    failed = [r for r in results if not r[1]]
    print(f"\nTOTAL {len(results)} FAIL {len(failed)}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
