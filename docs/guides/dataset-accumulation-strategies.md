# Dataset accumulation strategies

MLAir **`dataset_accumulation_buffers.accumulation_strategy`** controls how mutable runtime data becomes **immutable `dataset_versions`**. Values are enforced in API + Hub (`PATCH .../buffer`); invalid values fall back to **`snapshot_on_threshold`**.

| Strategy | Behavior | Typical materialization |
| --- | --- | --- |
| **`snapshot_on_threshold`** | Buffer grows until **`current_size` ≥ `target_threshold`**; then a new version is created and buffer advanced (runtime feedback path). | Automatic at threshold (see lineage materialization). |
| **`rolling_accumulate`** | Buffer grows; **no** automatic version on size alone; operators materialize manually or change strategy. | Manual / policy change. Hub shows an amber warning. |
| **`snapshot_on_schedule`** | Scheduler tick (`POST .../datasets/buffer/materialize-scheduled`) checks rows; materializes when size ≥ threshold. | Tick-driven. |
| **`manual_materialize_only`** | No auto snapshot from size; maintainer calls **`POST .../datasets/{id}/materialize`** (alias: **`.../buffer/materialize`**). | Operator button only. |

**Concurrency:** materialization uses advisory locks and idempotency keys (`lineage_service._materialize_runtime_feedback_if_needed`); see integration test **`test_materialization_concurrency_db`** when **`ML_AIR_RUN_DB_INTEGRATION_TESTS=1`**.

**Related:** [`readiness-and-gating.md`](../api/readiness-and-gating.md) (source types), Dataset Hub **Accumulation** tab, [`manage-datasets-and-train-from-model.md`](./manage-datasets-and-train-from-model.md).
