# Verify Phase 2 observability on a run

Smoke-check G1 + resource timeline APIs after a **SUCCESS** training run on a running `mlair serve` stack.

## Prerequisite

```bash
mlair serve --build
mlair health
```

Stack defaults enable usage tracking and resource monitoring.

## Automated check

```bash
export MLAIR_VERIFY_RUN_ID=<success-run-id>
export ML_AIR_BASE_URL=http://127.0.0.1:8080
export ML_AIR_TRACKING_TOKEN=admin-token

# Optional:
export MLAIR_VERIFY_MODEL_ID=<model-id>
export MLAIR_VERIFY_DATASET_ID=<dataset-id>
export MLAIR_VERIFY_DIFF_FROM=<version_id>
export MLAIR_VERIFY_DIFF_TO=<version_id>

python scripts/verify_phase2_run.py
```

## Manual Hub checks

1. **Run detail → Resources** — CPU/RAM/GPU chart and peak grid.
2. **Run detail → Environment** — Python / image metadata.
3. **Dataset → Versions** — compare + trace origin panels.
4. **Model → Overview → Trace origin** — provenance chain.
