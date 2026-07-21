"""TTL purge for native Postgres run log storage."""

from __future__ import annotations

import logging
import os
import threading
import time

from app.domains.shared.db_service import db_conn

logger = logging.getLogger("mlair.api.run_log_retention")


def retention_days() -> int:
    return max(1, int(os.getenv("ML_AIR_RUN_LOG_RETENTION_DAYS", "90") or "90"))


def purge_interval_sec() -> int:
    return max(60, int(os.getenv("ML_AIR_RUN_LOG_RETENTION_INTERVAL_SEC", "3600") or "3600"))


def retention_enabled() -> bool:
    return os.getenv("ML_AIR_RUN_LOG_RETENTION_ENABLED", "1").strip().lower() not in {
        "0",
        "false",
        "off",
        "no",
    }


def purge_expired_run_logs() -> int:
    """Delete log lines older than the configured retention window."""
    if not retention_enabled():
        return 0
    days = retention_days()
    sql = """
    DELETE FROM run_log_entries
    WHERE ts < NOW() - (%(days)s::text || ' days')::interval
    """
    try:
        with db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, {"days": days})
                deleted = int(cur.rowcount or 0)
        if deleted:
            logger.info("run_log_retention_purged deleted=%s days=%s", deleted, days)
        return deleted
    except Exception as exc:  # noqa: BLE001
        logger.warning("run_log_retention_purge_failed err=%s", exc)
        return 0


def start_run_log_retention_background() -> None:
    """Spawn a daemon thread that periodically purges expired run logs."""
    if not retention_enabled():
        return
    interval = purge_interval_sec()

    def _loop() -> None:
        while True:
            time.sleep(float(interval))
            try:
                purge_expired_run_logs()
            except Exception:  # noqa: BLE001
                logger.exception("run_log_retention_loop_error")

    thread = threading.Thread(target=_loop, name="mlair-run-log-retention", daemon=True)
    thread.start()
    logger.info("run_log_retention_started days=%s interval_sec=%s", retention_days(), interval)
