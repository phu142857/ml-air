from __future__ import annotations

import json
from typing import Any

from app.services.db_service import db_conn


def list_audit_timeline(
    *,
    tenant_id: str,
    project_id: str,
    limit: int = 50,
    offset: int = 0,
    resource_type: str | None = None,
    resource_id: str | None = None,
    kind: str | None = None,
    source: str | None = None,
    policy_id: str | None = None,
    dataset_version_id: str | None = None,
    readiness_status: str | None = None,
    limit_ceiling: int = 200,
) -> list[dict[str, Any]]:
    """
    Unified audit-ish timeline view (read-only aggregation).

    Notes:
    - This is *not* a full event-sourcing log; it surfaces key persisted tables that
      already exist (readiness evals, model approval/slots) plus run/task snapshots.
    - Ordering is by `ts` DESC.
    """
    safe_limit = max(1, min(max(1, min(10_000, int(limit_ceiling))), int(limit or 50)))
    safe_offset = max(0, int(offset or 0))
    rt = (resource_type or "").strip().lower() or None
    rid = (resource_id or "").strip() or None
    k = (kind or "").strip() or None
    src = (source or "").strip().lower() or None

    # Optional filter: only apply if both type+id are provided.
    where_rt = rt if (rt and rid) else None
    where_rid = rid if (rt and rid) else None
    where_kind = k
    # Source applies only to events that have a source column (readiness evals today).
    where_source = src
    pol = (policy_id or "").strip() or None
    dvid = (dataset_version_id or "").strip() or None
    rstat = (readiness_status or "").strip().lower() or None

    sql = """
    WITH timeline AS (
      -- Dataset readiness persisted evaluations (explicit audit rows)
      SELECT
        e.evaluated_at AS ts,
        'dataset.readiness.evaluated'::text AS kind,
        'dataset'::text AS resource_type,
        e.dataset_id::text AS resource_id,
        e.source::text AS source,
        json_build_object(
          'evaluation_id', e.evaluation_id,
          'dataset_version_id', e.dataset_version_id,
          'policy_id', e.policy_id,
          'required_size', e.required_size,
          'current_size', e.current_size,
          'status', e.status,
          'source', e.source,
          'reasons', e.reasons
        ) AS payload
      FROM dataset_readiness_evaluations e
      WHERE e.tenant_id = %(tenant_id)s AND e.project_id = %(project_id)s

      UNION ALL

      -- Model version created
      SELECT
        mv.created_at AS ts,
        'model.version.created'::text AS kind,
        'model'::text AS resource_type,
        m.model_id::text AS resource_id,
        NULL::text AS source,
        json_build_object(
          'version_id', mv.version_id,
          'version', mv.version,
          'stage', mv.stage,
          'artifact_uri', mv.artifact_uri,
          'run_id', mv.run_id
        ) AS payload
      FROM model_versions mv
      JOIN models m ON m.model_id = mv.model_id
      WHERE m.tenant_id = %(tenant_id)s AND m.project_id = %(project_id)s

      UNION ALL

      -- Model approval updated (only when it differs from created_at)
      SELECT
        mv.approval_updated_at AS ts,
        'model.version.approval_updated'::text AS kind,
        'model'::text AS resource_type,
        m.model_id::text AS resource_id,
        NULL::text AS source,
        json_build_object(
          'version_id', mv.version_id,
          'version', mv.version,
          'approval_status', mv.approval_status,
          'approval_reason', mv.approval_reason
        ) AS payload
      FROM model_versions mv
      JOIN models m ON m.model_id = mv.model_id
      WHERE m.tenant_id = %(tenant_id)s AND m.project_id = %(project_id)s
        AND mv.approval_updated_at IS NOT NULL
        AND mv.approval_updated_at <> mv.created_at

      UNION ALL

      -- Serving slot updated
      SELECT
        ms.updated_at AS ts,
        'model.serving_slot.updated'::text AS kind,
        'model'::text AS resource_type,
        ms.model_id::text AS resource_id,
        NULL::text AS source,
        json_build_object(
          'slot', ms.slot,
          'version_id', ms.version_id
        ) AS payload
      FROM model_serving_slots ms
      JOIN models m ON m.model_id = ms.model_id
      WHERE m.tenant_id = %(tenant_id)s AND m.project_id = %(project_id)s

      UNION ALL

      -- Run created / updated snapshots (best-effort; no full transition history table yet)
      SELECT
        r.created_at AS ts,
        'run.created'::text AS kind,
        'run'::text AS resource_type,
        r.run_id::text AS resource_id,
        NULL::text AS source,
        json_build_object(
          'pipeline_id', r.pipeline_id,
          'status', r.status,
          'idempotency_key', r.idempotency_key
        ) AS payload
      FROM runs r
      WHERE r.tenant_id = %(tenant_id)s AND r.project_id = %(project_id)s

      UNION ALL

      SELECT
        r.updated_at AS ts,
        'run.updated'::text AS kind,
        'run'::text AS resource_type,
        r.run_id::text AS resource_id,
        NULL::text AS source,
        json_build_object(
          'pipeline_id', r.pipeline_id,
          'status', r.status
        ) AS payload
      FROM runs r
      WHERE r.tenant_id = %(tenant_id)s AND r.project_id = %(project_id)s
        AND r.updated_at <> r.created_at

      UNION ALL

      -- Task created / updated snapshots
      SELECT
        t.created_at AS ts,
        'task.created'::text AS kind,
        'task'::text AS resource_type,
        t.task_id::text AS resource_id,
        NULL::text AS source,
        json_build_object(
          'run_id', t.run_id,
          'status', t.status,
          'attempt', t.attempt,
          'max_attempts', t.max_attempts
        ) AS payload
      FROM tasks t
      JOIN runs r ON r.run_id = t.run_id
      WHERE r.tenant_id = %(tenant_id)s AND r.project_id = %(project_id)s

      UNION ALL

      SELECT
        t.updated_at AS ts,
        'task.updated'::text AS kind,
        'task'::text AS resource_type,
        t.task_id::text AS resource_id,
        NULL::text AS source,
        json_build_object(
          'run_id', t.run_id,
          'status', t.status,
          'attempt', t.attempt
        ) AS payload
      FROM tasks t
      JOIN runs r ON r.run_id = t.run_id
      WHERE r.tenant_id = %(tenant_id)s AND r.project_id = %(project_id)s
        AND t.updated_at <> t.created_at
    )
    SELECT ts, kind, resource_type, resource_id, source, payload
    FROM timeline
    WHERE (
            (%(where_rt)s)::text IS NULL
            OR (%(where_rid)s)::text IS NULL
            OR (resource_type = (%(where_rt)s)::text AND resource_id = (%(where_rid)s)::text)
          )
      AND ((%(where_kind)s)::text IS NULL OR kind = (%(where_kind)s)::text)
      AND (
            (%(where_source)s)::text IS NULL
            OR COALESCE(source, '') = (%(where_source)s)::text
          )
      AND (
            (%(where_policy_id)s)::text IS NULL
            OR (
              kind = 'dataset.readiness.evaluated'
              AND (payload->>'policy_id') = (%(where_policy_id)s)::text
            )
          )
      AND (
            (%(where_dataset_version_id)s)::text IS NULL
            OR (
              kind = 'dataset.readiness.evaluated'
              AND (payload->>'dataset_version_id') = (%(where_dataset_version_id)s)::text
            )
          )
      AND (
            (%(where_readiness_status)s)::text IS NULL
            OR (
              kind = 'dataset.readiness.evaluated'
              AND LOWER(COALESCE(payload->>'status', '')) = (%(where_readiness_status)s)::text
            )
          )
    ORDER BY ts DESC
    LIMIT %(limit)s OFFSET %(offset)s
    """

    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                sql,
                {
                    "tenant_id": tenant_id,
                    "project_id": project_id,
                    "limit": safe_limit,
                    "offset": safe_offset,
                    "where_rt": where_rt,
                    "where_rid": where_rid,
                    "where_kind": where_kind,
                    "where_source": where_source,
                    "where_policy_id": pol,
                    "where_dataset_version_id": dvid,
                    "where_readiness_status": rstat,
                },
            )
            rows = cur.fetchall()

    out: list[dict[str, Any]] = []
    for ts, kind, rtype, rid2, src_row, payload in rows:
        # payload is already a dict-like (psycopg json) or string; normalize.
        if isinstance(payload, str):
            try:
                payload_val: Any = json.loads(payload)
            except Exception:
                payload_val = {"raw": payload}
        else:
            payload_val = payload
        out.append(
            {
                "ts": ts.isoformat() if ts else None,
                "kind": str(kind),
                "resource_type": str(rtype),
                "resource_id": str(rid2),
                "source": str(src_row) if src_row is not None else None,
                "payload": payload_val,
            }
        )
    return out

