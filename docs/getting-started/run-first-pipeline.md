# Run Your First Pipeline

## Goal

Complete one lifecycle train flow: **dataset version → readiness → run** — without treating “create DAG” as the primary path.

## Recommended path (Hub)

1. Start MLAir: `make up` (or `python ./mlair dev up`).
2. Open Hub: `http://localhost:38080` → **Datasets**.
3. Open a dataset → tab **Run / Train** → **Train with model** or **Run with pipeline**.
4. Open the run from the success link or **Runs** (maintainer nav) for task progress.

See [Dataset Hub and Readiness](../guides/dataset-hub-and-readiness.md).

## Alternative (CLI smoke / automation)

For CI or headless smoke only:

```bash
python ./mlair dev up
python ./mlair run examples/pipeline.demo.yaml
python ./mlair logs <run_id> --limit 100
```

Prefer Hub **Run / Train** for operator workflows; CLI `run` does not replace lifecycle gates or dataset pinning.

## Result

A new run appears; tasks move `PENDING` → `RUNNING` → terminal state under one `run_id`.

## Done

Continue with [Monitor a Run](../guides/monitor-run.md) and [Hub lifecycle-first UX](../guides/hub-lifecycle-first.md).
