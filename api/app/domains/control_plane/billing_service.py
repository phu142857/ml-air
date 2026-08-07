"""Usage attribution & chargeback (Phase 5 Epic 2)."""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from app.domains.observability import usage_service
from app.domains.shared.db_service import db_conn

DEFAULT_RATES = {
    "cpu_core_hour": Decimal("0.04"),
    "gpu_hour": Decimal("1.20"),
    "memory_gb_hour": Decimal("0.01"),
    "storage_gb_month": Decimal("0.023"),
    "network_gb": Decimal("0.09"),
    "serving_hour": Decimal("0.15"),
    "training_hour": Decimal("0.80"),
}


def seed_default_rates() -> None:
    with db_conn() as conn:
        with conn.cursor() as cur:
            for resource_type, rate in DEFAULT_RATES.items():
                rid = f"default-{resource_type}"
                cur.execute(
                    """
                    INSERT INTO cp_pricing_rates (rate_id, resource_type, unit, rate_usd)
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT (rate_id) DO NOTHING
                    """,
                    (rid, resource_type, "usd", rate),
                )


def list_rates() -> list[dict[str, Any]]:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT rate_id, resource_type, unit, rate_usd, metadata FROM cp_pricing_rates ORDER BY resource_type")
            rows = cur.fetchall() or []
    return [
        {"rate_id": r[0], "resource_type": r[1], "unit": r[2], "rate_usd": float(r[3]), "metadata": r[4] or {}}
        for r in rows
    ]


def estimate_run_cost_usd(*, run_id: str) -> float:
    bundle = usage_service.get_run_usage_bundle(run_id)
    totals = bundle.get("totals") or {}
    gpu_h = float(totals.get("gpu_util_pct_peak") or 0) / 100.0 * 0.5
    cpu_h = float(totals.get("cpu_pct_peak") or 0) / 100.0 * 0.5
    mem_gb_h = float(totals.get("memory_mb_peak") or 0) / 1024.0 * 0.5
    net_gb = (float(totals.get("network_rx_bytes") or 0) + float(totals.get("network_tx_bytes") or 0)) / (1024**3)
    cost = (
        float(DEFAULT_RATES["gpu_hour"]) * gpu_h
        + float(DEFAULT_RATES["cpu_core_hour"]) * cpu_h
        + float(DEFAULT_RATES["memory_gb_hour"]) * mem_gb_h
        + float(DEFAULT_RATES["network_gb"]) * net_gb
    )
    return round(cost, 4)


def build_project_chargeback(*, tenant_id: str, project_id: str, days: int = 30) -> dict[str, Any]:
    usage = usage_service.get_project_usage_bundle(tenant_id=tenant_id, project_id=project_id, days=days)
    runs = usage.get("top_runs") or []
    run_costs = []
    total = 0.0
    for r in runs:
        rid = str(r.get("run_id") or "")
        if not rid:
            continue
        c = estimate_run_cost_usd(run_id=rid)
        total += c
        run_costs.append({"run_id": rid, "cost_usd": c, "usage": r})
    return {
        "tenant_id": tenant_id,
        "project_id": project_id,
        "period_days": days,
        "total_cost_usd": round(total, 4),
        "runs": run_costs,
        "usage_summary": usage.get("totals") or {},
        "categories": {
            "training": round(total * 0.7, 4),
            "serving": round(total * 0.2, 4),
            "storage": round(total * 0.1, 4),
        },
    }


def save_monthly_snapshot(*, tenant_id: str, project_id: str, period_key: str | None = None) -> dict[str, Any]:
    key = period_key or datetime.now(timezone.utc).strftime("%Y-%m")
    payload = build_project_chargeback(tenant_id=tenant_id, project_id=project_id, days=30)
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO cp_chargeback_snapshots (tenant_id, project_id, period_key, payload)
                VALUES (%s, %s, %s, %s::jsonb)
                ON CONFLICT (tenant_id, project_id, period_key)
                DO UPDATE SET payload = EXCLUDED.payload, created_at = NOW()
                """,
                (tenant_id, project_id, key, json.dumps(payload)),
            )
    return {"period_key": key, "snapshot": payload}


def list_snapshots(tenant_id: str, project_id: str) -> list[dict[str, Any]]:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT period_key, payload, created_at
                FROM cp_chargeback_snapshots
                WHERE tenant_id = %s AND project_id = %s
                ORDER BY period_key DESC
                """,
                (tenant_id, project_id),
            )
            rows = cur.fetchall() or []
    return [
        {
            "period_key": r[0],
            "payload": r[1] if isinstance(r[1], dict) else json.loads(r[1] or "{}"),
            "created_at": r[2].isoformat() if r[2] else None,
        }
        for r in rows
    ]
