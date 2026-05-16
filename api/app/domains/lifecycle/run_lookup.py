"""Lifecycle port: load run fields for readiness without importing orchestration."""

from __future__ import annotations

import json
from typing import Any

from app.domains.shared.db_service import db_conn

_RUN_COLUMNS = """
    run_id, tenant_id, project_id, pipeline_id, status, idempotency_key, priority, max_parallel_tasks,
    experiment_id, pipeline_version_id, config_snapshot, replay_of_run_id, replay_from_task_id, plugin_name,
    plugin_context, created_at, updated_at, override_config, training_mode
"""


def _parse_json_field(raw: Any) -> Any:
    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except Exception:
            return None
    return raw


def _row_to_run(row: tuple) -> dict[str, Any]:
    return {
        "run_id": row[0],
        "tenant_id": row[1],
        "project_id": row[2],
        "pipeline_id": row[3],
        "status": row[4],
        "idempotency_key": row[5],
        "priority": row[6],
        "max_parallel_tasks": row[7],
        "experiment_id": row[8],
        "pipeline_version_id": row[9],
        "config_snapshot": _parse_json_field(row[10]),
        "replay_of_run_id": row[11],
        "replay_from_task_id": row[12],
        "plugin_name": row[13],
        "plugin_context": _parse_json_field(row[14]) or {},
        "created_at": row[15],
        "updated_at": row[16],
        "override_config": _parse_json_field(row[17]) or {},
        "training_mode": row[18],
    }


def load_run_for_readiness(run_id: str) -> dict[str, Any] | None:
    """Read-only run projection for ``check_run_readiness`` (no orchestration imports)."""
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT {_RUN_COLUMNS} FROM runs WHERE run_id = %s",
                (run_id,),
            )
            row = cur.fetchone()
    if not row:
        return None
    return _row_to_run(row)
