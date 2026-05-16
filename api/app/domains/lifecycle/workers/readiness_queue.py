"""Async readiness evaluation queue (Redis list + API background drain)."""

from __future__ import annotations

import json
import logging
import os
import threading
import time
from typing import Any
from uuid import uuid4

logger = logging.getLogger("mlair.lifecycle.readiness_queue")

REDIS_LIST_KEY = "mlair:lifecycle:readiness:evaluate"
_drain_thread: threading.Thread | None = None
_drain_stop = threading.Event()


def async_queue_enabled() -> bool:
    return os.getenv("ML_AIR_READINESS_ASYNC_QUEUE", "").strip() == "1"


def drain_interval_sec() -> int:
    raw = os.getenv("ML_AIR_READINESS_QUEUE_DRAIN_INTERVAL_SEC", "2").strip()
    try:
        n = int(raw)
    except ValueError:
        return 2
    return max(1, min(n, 60))


def enqueue_readiness_evaluation(
    *,
    tenant_id: str,
    project_id: str,
    dataset_id: str,
    required_size: int | None = None,
    dataset_version_id: str | None = None,
    policy_id: str | None = None,
    source: str | None = None,
    force_persist: bool = False,
) -> str:
    from app.services.queue_service import redis_client

    job_id = str(uuid4())
    payload = {
        "job_id": job_id,
        "tenant_id": tenant_id,
        "project_id": project_id,
        "dataset_id": dataset_id,
        "required_size": required_size,
        "dataset_version_id": dataset_version_id,
        "policy_id": policy_id,
        "source": (source or "async_queue").strip() or "async_queue",
        "force_persist": bool(force_persist),
        "enqueued_at": time.time(),
    }
    redis_client().rpush(REDIS_LIST_KEY, json.dumps(payload, default=str))
    return job_id


def _process_one(raw: str) -> bool:
    from app.services import readiness_service
    from app.services import realtime_events as rt
    from app.services.trace_service import get_trace_id
    from datetime import datetime, timezone

    try:
        job = json.loads(raw)
    except json.JSONDecodeError:
        logger.warning("readiness_queue_invalid_json")
        return False
    if not isinstance(job, dict):
        return False

    tenant_id = str(job.get("tenant_id") or "").strip()
    project_id = str(job.get("project_id") or "").strip()
    dataset_id = str(job.get("dataset_id") or "").strip()
    if not tenant_id or not project_id or not dataset_id:
        logger.warning("readiness_queue_missing_scope job_id=%s", job.get("job_id"))
        return False

    try:
        result = readiness_service.evaluate_dataset_readiness(
            tenant_id=tenant_id,
            project_id=project_id,
            dataset_id=dataset_id,
            required_size=job.get("required_size"),
            dataset_version_id=job.get("dataset_version_id"),
            policy_id=job.get("policy_id"),
        )
        _evaluation_id, _evaluated_at, inserted = readiness_service.persist_dataset_readiness_evaluation_with_dedupe(
            tenant_id=tenant_id,
            project_id=project_id,
            dataset_id=dataset_id,
            result=result,
            source=str(job.get("source") or "async_queue"),
            force_persist=bool(job.get("force_persist")),
        )
        if inserted:
            rt.emit_dataset_readiness_updated(
                tenant_id=tenant_id,
                project_id=project_id,
                dataset_id=dataset_id,
                required_size=int(result.get("required_size") or 0),
                current_size=int(result.get("current_size") or 0),
                status=str(result.get("status") or "blocked"),
                updated_at=datetime.now(timezone.utc),
                source=str(job.get("source") or "async_queue"),
                trace_id=get_trace_id(),
            )
        logger.info(
            "readiness_queue_processed job_id=%s tenant=%s project=%s dataset=%s inserted=%s",
            job.get("job_id"),
            tenant_id,
            project_id,
            dataset_id,
            inserted,
        )
        return True
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "readiness_queue_process_failed job_id=%s err=%s",
            job.get("job_id"),
            exc,
        )
        return False


def drain_once(*, max_jobs: int = 8) -> int:
    from app.services.queue_service import redis_client

    client = redis_client()
    processed = 0
    for _ in range(max(1, min(int(max_jobs), 32))):
        raw = client.lpop(REDIS_LIST_KEY)
        if raw is None:
            break
        if isinstance(raw, bytes):
            raw = raw.decode("utf-8", errors="replace")
        if _process_one(str(raw)):
            processed += 1
    return processed


def _drain_loop() -> None:
    interval = drain_interval_sec()
    logger.info("readiness_queue_drain_started interval_sec=%s", interval)
    while not _drain_stop.is_set():
        try:
            if async_queue_enabled():
                n = drain_once()
                if n:
                    logger.debug("readiness_queue_drained count=%s", n)
        except Exception as exc:  # noqa: BLE001
            logger.warning("readiness_queue_drain_error err=%s", exc)
        _drain_stop.wait(interval)


def start_readiness_queue_background() -> None:
    global _drain_thread
    if not async_queue_enabled():
        return
    if drain_interval_sec() <= 0:
        return
    if _drain_thread is not None and _drain_thread.is_alive():
        return
    _drain_stop.clear()
    _drain_thread = threading.Thread(target=_drain_loop, name="mlair-readiness-queue", daemon=True)
    _drain_thread.start()
