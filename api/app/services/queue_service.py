import json
import os
from typing import Any

from redis import Redis


def _redis_url() -> str:
    return os.getenv("ML_AIR_REDIS_URL", "redis://redis:6379/0")


def redis_client() -> Redis:
    return Redis.from_url(_redis_url(), decode_responses=True)


def publish_run_event(event: dict[str, Any]) -> None:
    payload = json.dumps(event)
    redis_client().rpush("mlair:runs:new", payload)


def replay_dlq_for_run(run_id: str) -> int:
    client = redis_client()
    items = client.lrange("mlair:tasks:dlq", 0, -1)
    replayed = 0
    for raw in items:
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            continue
        if payload.get("run_id") != run_id:
            continue
        payload["status"] = "RETRY"
        payload["event_type"] = "task_ready"
        payload["attempt"] = int(payload.get("attempt", 1)) + 1
        client.rpush("mlair:tasks:default", json.dumps(payload))
        client.lrem("mlair:tasks:dlq", 1, raw)
        replayed += 1
    return replayed
