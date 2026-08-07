"""AutoML search jobs (Phase 5 Epic 7)."""

from __future__ import annotations

import json
import uuid
from typing import Any

from app.domains.control_plane.automl_search import generate_trials, pick_best_trial
from app.domains.shared.db_service import db_conn
from app.domains.shared.queue_service import publish_run_event


def create_job(
    *,
    tenant_id: str,
    project_id: str,
    pipeline_id: str,
    dataset_id: str | None,
    search_space: dict[str, Any],
) -> dict[str, Any]:
    jid = str(uuid.uuid4())
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO cp_automl_jobs
                    (job_id, tenant_id, project_id, pipeline_id, dataset_id, search_space, status)
                VALUES (%s, %s, %s, %s, %s, %s::jsonb, 'pending')
                """,
                (jid, tenant_id, project_id, pipeline_id, dataset_id, json.dumps(search_space)),
            )
    return {"job_id": jid, "status": "pending", "search_space": search_space}


def list_jobs(tenant_id: str, project_id: str) -> list[dict[str, Any]]:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT job_id, pipeline_id, dataset_id, search_space, status, best_run_id, created_at
                FROM cp_automl_jobs
                WHERE tenant_id = %s AND project_id = %s
                ORDER BY created_at DESC
                LIMIT 100
                """,
                (tenant_id, project_id),
            )
            rows = cur.fetchall() or []
    return [_row_to_job(row, tenant_id, project_id) for row in rows]


def _row_to_job(row: tuple, tenant_id: str | None = None, project_id: str | None = None) -> dict[str, Any]:
    space = row[3] if isinstance(row[3], dict) else json.loads(row[3] or "{}")
    return {
        "job_id": row[0],
        "tenant_id": tenant_id,
        "project_id": project_id,
        "pipeline_id": row[1],
        "dataset_id": row[2],
        "search_space": space,
        "status": row[4],
        "best_run_id": row[5],
        "created_at": row[6].isoformat() if row[6] else None,
        "trials": space.get("trials") or [],
        "best_trial": space.get("best_trial"),
    }


def start_search(*, job_id: str) -> dict[str, Any]:
    job = get_job(job_id)
    if not job:
        raise ValueError("job_not_found")
    space = dict(job.get("search_space") or {})
    trials = space.get("trials") or generate_trials(space)
    space["trials"] = trials
    space["current_trial_index"] = 0
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE cp_automl_jobs SET status = 'searching', search_space = %s::jsonb WHERE job_id = %s",
                (json.dumps(space), job_id),
            )
    if not trials:
        raise ValueError("no_trials_generated")
    return enqueue_next_trial(job_id=job_id)


def enqueue_next_trial(*, job_id: str) -> dict[str, Any]:
    job = get_job(job_id)
    if not job:
        raise ValueError("job_not_found")
    space = dict(job.get("search_space") or {})
    trials: list[dict[str, Any]] = list(space.get("trials") or [])
    idx = int(space.get("current_trial_index") or 0)
    pending = [i for i, t in enumerate(trials) if t.get("status") == "pending"]
    if not pending:
        best = pick_best_trial(trials, objective=str(space.get("objective") or "maximize"))
        status = "completed"
        best_run_id = best.get("run_id") if best else job.get("best_run_id")
        with db_conn() as conn:
            with conn.cursor() as cur:
                space["best_trial"] = best
                cur.execute(
                    "UPDATE cp_automl_jobs SET status = %s, best_run_id = %s, search_space = %s::jsonb WHERE job_id = %s",
                    (status, best_run_id, json.dumps(space), job_id),
                )
        return {"job_id": job_id, "status": status, "best_trial": best, "trials_complete": True}
    trial_idx = pending[0]
    trial = trials[trial_idx]
    run_id = str(uuid.uuid4())
    trial["status"] = "running"
    trial["run_id"] = run_id
    space["current_trial_index"] = trial_idx + 1
    space["trials"] = trials
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE cp_automl_jobs SET status = 'running', search_space = %s::jsonb, best_run_id = %s WHERE job_id = %s",
                (json.dumps(space), run_id, job_id),
            )
    publish_run_event(
        {
            "run_id": run_id,
            "tenant_id": job["tenant_id"],
            "project_id": job["project_id"],
            "pipeline_id": job["pipeline_id"],
            "dataset_id": job.get("dataset_id"),
            "automl_job_id": job_id,
            "automl_trial_id": trial.get("trial_id"),
            "hyperparameters": trial.get("params") or {},
            "status": "PENDING",
        }
    )
    return {
        "job_id": job_id,
        "run_id": run_id,
        "trial_id": trial.get("trial_id"),
        "params": trial.get("params"),
        "trial_index": trial_idx,
        "trials_total": len(trials),
        "status": "running",
    }


def record_trial_result(*, job_id: str, trial_id: str, score: float, run_id: str | None = None) -> dict[str, Any]:
    job = get_job(job_id)
    if not job:
        raise ValueError("job_not_found")
    space = dict(job.get("search_space") or {})
    trials: list[dict[str, Any]] = list(space.get("trials") or [])
    for trial in trials:
        if str(trial.get("trial_id")) == str(trial_id):
            trial["status"] = "completed"
            trial["score"] = float(score)
            if run_id:
                trial["run_id"] = run_id
            break
    else:
        raise ValueError("trial_not_found")
    best = pick_best_trial(trials, objective=str(space.get("objective") or "maximize"))
    space["trials"] = trials
    space["best_trial"] = best
    best_run_id = best.get("run_id") if best else job.get("best_run_id")
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE cp_automl_jobs SET search_space = %s::jsonb, best_run_id = %s WHERE job_id = %s",
                (json.dumps(space), best_run_id, job_id),
            )
    pending = [t for t in trials if t.get("status") == "pending"]
    if pending:
        return enqueue_next_trial(job_id=job_id)
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE cp_automl_jobs SET status = 'completed' WHERE job_id = %s",
                (job_id,),
            )
    return {"job_id": job_id, "status": "completed", "best_trial": best, "score": score}


def start_job(*, job_id: str, run_id: str) -> dict[str, Any]:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE cp_automl_jobs SET status = 'running', best_run_id = %s
                WHERE job_id = %s RETURNING tenant_id, project_id, pipeline_id
                """,
                (run_id, job_id),
            )
            row = cur.fetchone()
    if not row:
        raise ValueError("job_not_found")
    tenant_id, project_id, pipeline_id = row
    publish_run_event(
        {
            "run_id": run_id,
            "tenant_id": tenant_id,
            "project_id": project_id,
            "pipeline_id": pipeline_id,
            "automl_job_id": job_id,
            "status": "PENDING",
        }
    )
    return {"job_id": job_id, "run_id": run_id, "status": "running"}


def complete_job(*, job_id: str, best_run_id: str, promote: bool = False) -> dict[str, Any]:
    status = "promoted" if promote else "completed"
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE cp_automl_jobs SET status = %s, best_run_id = %s WHERE job_id = %s",
                (status, best_run_id, job_id),
            )
    return {"job_id": job_id, "best_run_id": best_run_id, "status": status}


def get_job(job_id: str) -> dict[str, Any] | None:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT job_id, tenant_id, project_id, pipeline_id, dataset_id, search_space, status, best_run_id, created_at
                FROM cp_automl_jobs WHERE job_id = %s
                """,
                (job_id,),
            )
            row = cur.fetchone()
    if not row:
        return None
    return _row_to_job(row, row[1], row[2])
