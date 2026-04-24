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
        message = client.blpop(["mlair:tasks:high", "mlair:tasks:default", "mlair:tasks:low"], timeout=2)
        if not message:
            continue

        queue_name, raw_payload = message
        task = json.loads(raw_payload)
        started_at = datetime.now(timezone.utc).isoformat()
        duration = random.uniform(0.2, 0.7)
        if task.get("pipeline_id", "").startswith("slow"):
            duration = 3.0
        time.sleep(duration)
        finished_at = datetime.now(timezone.utc).isoformat()
        status = "SUCCESS"
        # Deterministic failure mode to validate retry/backoff flow.
        if task.get("pipeline_id", "").startswith("fail_once") and int(task.get("attempt", 1)) == 1:
            status = "FAILED"
        if task.get("pipeline_id", "").startswith("always_fail"):
            status = "FAILED"
        print(
            json.dumps(
                {
                    "event_type": "task_finished",
                    "run_id": task["run_id"],
                    "task_id": task["task_id"],
                    "status": status,
                    "attempt": task["attempt"],
                    "pipeline_id": task.get("pipeline_id", "demo_pipeline"),
                    "priority": task.get("priority", "normal"),
                    "queue": queue_name,
                    "started_at": started_at,
                    "finished_at": finished_at,
                }
            )
        )
        client.rpush(
            f'mlair:logs:{task["run_id"]}',
            json.dumps(
                {
                    "ts": finished_at,
                    "level": "INFO" if status == "SUCCESS" else "ERROR",
                    "message": f'task {task["task_id"]} finished with {status}',
                    "payload": {
                        "task_id": task["task_id"],
                        "attempt": task["attempt"],
                        "pipeline_id": task.get("pipeline_id", "demo_pipeline"),
                        "priority": task.get("priority", "normal"),
                        "queue": queue_name,
                    },
                }
            ),
        )
        client.rpush(
            "mlair:tasks:done",
            json.dumps(
                {
                    "event_type": "task_finished",
                    "run_id": task["run_id"],
                    "task_id": task["task_id"],
                    "status": status,
                    "attempt": task["attempt"],
                    "pipeline_id": task.get("pipeline_id", "demo_pipeline"),
                    "priority": task.get("priority", "normal"),
                    "started_at": started_at,
                    "finished_at": finished_at,
                }
            ),
        )


if __name__ == "__main__":
    main()
