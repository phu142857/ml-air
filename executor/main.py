import json
import os
import random
import time
from datetime import datetime, timezone

from redis import Redis


def _redis() -> Redis:
    url = os.getenv("ML_AIR_REDIS_URL", "redis://redis:6379/0")
    return Redis.from_url(url, decode_responses=True)


def main() -> None:
    client = _redis()
    print("executor started")
    while True:
        message = client.blpop("mlair:tasks:default", timeout=2)
        if not message:
            continue

        _, raw_payload = message
        task = json.loads(raw_payload)
        started_at = datetime.now(timezone.utc).isoformat()
        time.sleep(random.uniform(0.2, 0.7))
        finished_at = datetime.now(timezone.utc).isoformat()
        print(
            json.dumps(
                {
                    "event_type": "task_finished",
                    "run_id": task["run_id"],
                    "task_id": task["task_id"],
                    "status": "SUCCESS",
                    "attempt": task["attempt"],
                    "started_at": started_at,
                    "finished_at": finished_at,
                }
            )
        )
        client.rpush(
            "mlair:tasks:done",
            json.dumps(
                {
                    "event_type": "task_finished",
                    "run_id": task["run_id"],
                    "task_id": task["task_id"],
                    "status": "SUCCESS",
                    "attempt": task["attempt"],
                    "started_at": started_at,
                    "finished_at": finished_at,
                }
            ),
        )


if __name__ == "__main__":
    main()
