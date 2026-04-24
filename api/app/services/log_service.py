import json
from datetime import datetime, timezone

from app.services.queue_service import redis_client
from app.services.trace_service import get_trace_id


def append_run_log(run_id: str, level: str, message: str, payload: dict | None = None) -> None:
    entry = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "trace_id": get_trace_id(),
        "level": level,
        "message": message,
        "payload": payload or {},
    }
    client = redis_client()
    client.rpush(f"mlair:logs:{run_id}", json.dumps(entry))


def read_run_logs(run_id: str, offset: int = 0, limit: int = 200) -> list[dict]:
    client = redis_client()
    end = offset + max(1, min(limit, 1000)) - 1
    raw_items = client.lrange(f"mlair:logs:{run_id}", offset, end)
    parsed: list[dict] = []
    for raw in raw_items:
        try:
            parsed.append(json.loads(raw))
        except json.JSONDecodeError:
            parsed.append({"ts": datetime.now(timezone.utc).isoformat(), "level": "WARN", "message": raw, "payload": {}})
    return parsed
