"""Background cluster heartbeat staleness checker."""

from __future__ import annotations

import logging
import os
import threading
import time

logger = logging.getLogger("mlair.api.cluster_agent_bg")

_started = False
_lock = threading.Lock()


def start_cluster_health_background() -> None:
    global _started
    if os.getenv("ML_AIR_MULTI_CLUSTER", "0").strip() != "1":
        return
    with _lock:
        if _started:
            return
        _started = True
    t = threading.Thread(target=_loop, name="mlair-cluster-health", daemon=True)
    t.start()
    logger.info("cluster_health_background_started")


def _loop() -> None:
    from app.domains.distributed import cluster_registry_service as cluster_svc

    interval = max(30, int(os.getenv("ML_AIR_CLUSTER_HEALTH_INTERVAL_SEC", "60")))
    while True:
        try:
            n = cluster_svc.mark_stale_clusters()
            if n:
                logger.info("clusters_marked_stale count=%s", n)
        except Exception as exc:  # noqa: BLE001
            logger.warning("cluster_health_tick_failed err=%s", exc)
        time.sleep(interval)
