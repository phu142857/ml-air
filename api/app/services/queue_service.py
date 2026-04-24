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
