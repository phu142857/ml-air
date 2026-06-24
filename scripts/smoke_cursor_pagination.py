#!/usr/bin/env python3
"""Smoke: cursor pagination contract on live API (quickstart)."""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

BASE = os.getenv("ML_AIR_BASE_URL", "http://localhost:8080").rstrip("/")
TENANT = os.getenv("ML_AIR_TENANT_ID", "default")
PROJECT = os.getenv("ML_AIR_PROJECT_ID", "default_project")
TOKEN = os.getenv("ML_AIR_TOKEN", "viewer-token")


def get(path: str) -> tuple[int, dict]:
    req = urllib.request.Request(
        f"{BASE}{path}",
        headers={"Authorization": f"Bearer {TOKEN}"},
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return resp.status, json.loads(resp.read().decode() or "{}")
    except urllib.error.HTTPError as exc:
        body = exc.read().decode()
        try:
            return exc.code, json.loads(body)
        except json.JSONDecodeError:
            return exc.code, {"raw": body}


def assert_cursor_page(name: str, code: int, body: dict) -> bool:
    if code != 200:
        print(f"  FAIL {name}: HTTP {code} {body}")
        return False
    for key in ("items", "limit", "has_more", "next_cursor"):
        if key not in body:
            print(f"  FAIL {name}: missing field {key!r}")
            return False
    if not isinstance(body["items"], list):
        print(f"  FAIL {name}: items not a list")
        return False
    print(
        f"  OK   {name}: limit={body['limit']} items={len(body['items'])} "
        f"has_more={body['has_more']} next_cursor={'yes' if body.get('next_cursor') else 'no'}"
    )
    return True


def main() -> int:
    print(f"Smoke cursor pagination @ {BASE} ({TENANT}/{PROJECT})")
    ok = True

    endpoints = [
        ("runs", f"/v1/tenants/{TENANT}/projects/{PROJECT}/runs?limit=2"),
        ("pipelines", f"/v1/tenants/{TENANT}/projects/{PROJECT}/pipelines?limit=2"),
        ("models", f"/v1/tenants/{TENANT}/projects/{PROJECT}/models?limit=2"),
        ("datasets", f"/v1/tenants/{TENANT}/projects/{PROJECT}/datasets?limit=2"),
        ("search", f"/v1/tenants/{TENANT}/projects/{PROJECT}/search?q=run&type=all&limit=2"),
        ("audit", f"/v1/tenants/{TENANT}/projects/{PROJECT}/audit/timeline?limit=2"),
    ]

    cursors: dict[str, str | None] = {}
    for name, path in endpoints:
        code, body = get(path)
        if not assert_cursor_page(name, code, body):
            ok = False
            continue
        cursors[name] = body.get("next_cursor")

    # Page 2 when cursor present
    for name, path in endpoints:
        cursor = cursors.get(name)
        if not cursor:
            print(f"  SKIP {name} page-2: no next_cursor (empty or single page)")
            continue
        code, body = get(f"{path}&cursor={urllib.parse.quote(cursor)}")
        if not assert_cursor_page(f"{name} page-2", code, body):
            ok = False

    # Mutually exclusive cursor + offset
    import urllib.parse

    bad_path = (
        f"/v1/tenants/{TENANT}/projects/{PROJECT}/runs?limit=2&offset=1&cursor="
        + urllib.parse.quote(cursors.get("runs") or "e30")
    )
    code, body = get(bad_path)
    if code == 422:
        print("  OK   cursor+offset mutual exclusion: HTTP 422")
    else:
        print(f"  FAIL cursor+offset: expected 422, got {code} {body}")
        ok = False

    print("PASS" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
