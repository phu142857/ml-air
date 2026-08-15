#!/usr/bin/env python3
"""Seed Phase 4 governance + Phase 3 notification/integration demo resources.

  python scripts/seed_governance_demo.py
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


def main() -> int:
    require_api_reachable(BASE)
    token = resolve_smoke_bearer_token("maintainer")
    prefix = f"/v1/tenants/{TENANT}/projects/{PROJECT}"

    code, policies = req("GET", f"{prefix}/governance/retention/policies", token)
    has_retention = code == 200 and any(
        isinstance(p, dict) and p.get("data_category") == "domain_audit" for p in (policies.get("items") or [])
    )
    if has_retention:
        print("[SKIP] governance retention policy exists")
    else:
        code, policy = req(
            "PUT",
            f"{prefix}/governance/retention/policies",
            token,
            {
                "data_category": "domain_audit",
                "retention_days": 90,
                "action": "purge",
                "enabled": True,
            },
        )
        if code != 200:
            print(f"[WARN] retention policy: {code} {policy}")
        else:
            print("[OK] governance retention policy")

    code, siem_list = req("GET", f"{prefix}/governance/siem/subscriptions", token)
    has_siem = code == 200 and any(
        isinstance(s, dict) and s.get("name") == "demo-siem-sink" for s in (siem_list.get("items") or [])
    )
    if has_siem:
        print("[SKIP] governance SIEM subscription exists")
    else:
        code, siem = req(
            "POST",
            f"{prefix}/governance/siem/subscriptions",
            token,
            {
                "name": "demo-siem-sink",
                "sink_type": "http",
                "target_url": "https://example.invalid/siem/demo",
                "export_format": "jsonl",
                "event_actions": ["run.completed", "dataset.readiness.evaluated"],
                "enabled": False,
            },
        )
        if code not in (200, 201):
            print(f"[WARN] siem subscription: {code} {siem}")
        else:
            print("[OK] governance SIEM subscription (disabled target)")

    code, schema = req(
        "POST",
        "/v1/governance/event-schemas",
        token,
        {
            "event_type": "demo.lifecycle.event",
            "event_version": 1,
            "schema": {"type": "object", "properties": {"message": {"type": "string"}}},
            "description": "Demo schema for registry UI",
        },
    )
    if code not in (200, 201):
        print(f"[WARN] event schema: {code} {schema}")
    else:
        print("[OK] governance event schema")

    code, dg = req(
        "PUT",
        f"{prefix}/governance/policy",
        token,
        {"classification": "internal", "allow_erasure": False, "config": {"demo": True}},
    )
    if code != 200:
        print(f"[WARN] data governance policy: {code} {dg}")
    else:
        print("[OK] data governance policy")

    code, channel = req(
        "POST",
        f"{prefix}/notifications/channels",
        token,
        {
            "channel_type": "slack",
            "name": "demo-slack",
            "config": {"webhook_url": "https://example.invalid/slack/demo"},
            "event_actions": ["run.completed"],
            "enabled": False,
        },
    )
    if code not in (200, 201):
        print(f"[WARN] notification channel: {code} {channel}")
    else:
        print("[OK] notification channel (disabled)")

    code, integration = req(
        "POST",
        f"{prefix}/integrations/subscriptions",
        token,
        {
            "name": "demo-erp-hook",
            "integration_type": "erp",
            "target_url": "https://example.invalid/erp/demo",
            "event_actions": ["model.version.promoted"],
            "enabled": False,
        },
    )
    if code not in (200, 201):
        print(f"[WARN] integration subscription: {code} {integration}")
    else:
        print("[OK] integration subscription (disabled)")

    code, obs = req("GET", f"{prefix}/governance/observability", token)
    if code == 200:
        print(f"[OK] governance observability snapshot keys={list(obs.keys())[:6]}")
    else:
        print(f"[WARN] governance observability: {code} {obs}")

    print(json.dumps({"status": "ok", "tenant": TENANT, "project": PROJECT}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
