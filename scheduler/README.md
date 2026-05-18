# scheduler

Dedicated DAG scheduler service that consumes run events and emits ready tasks to the queue.

## Multi-replica (Wave 1)

- **Run queue:** multiple replicas may `BLPOP` `mlair:runs:new` safely (at-most-one consumer per message).
- **Periodic ticks:** trigger-policy and scheduled materialization ticks use Redis locks (`mlair:scheduler:tick-lock:*`) so only one replica runs each tick per interval. Disable with `ML_AIR_SCHEDULER_TICK_LOCK=0` for single-process dev only.
- **Scale:** `docker compose ... up -d --scale scheduler=2` (see [wave1-production-maturity](../docs/runbooks/wave1-production-maturity.md)).
