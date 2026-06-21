# Quickstart

## Goal

Boot MLAir locally and run a demo pipeline in minutes.

## Steps

1. Build images.
2. Start services.
3. Verify health.
4. Seed and smoke-check demo run.

## Command

```bash
cp .env.example .env
make build
make up
make health
make seed-demo
make smoke-quickstart
```

## Result

You should get a successful smoke run and be able to open UI at `http://localhost:38080`.

## Startup Hooks (External Integrations)

If your external service supports startup sync to the MLAir model registry, enable it with **that service’s own** environment flags and optional clinic/tenant mapping (names vary by product).

```bash
# Example placeholders — use your bridge’s documented variables instead
export YOUR_APP_MLAIR_SYNC_MODELS_ON_STARTUP=true
export MLAIR_MODEL_SCOPE_PER_CLINIC=true
export MLAIR_CLINIC_PROJECT_MAP_JSON='{"clinic-a":"project_clinic_a"}'
export MLAIR_CLINIC_TENANT_MAP_JSON='{"clinic-a":"default"}'
```

This hook should be best-effort (startup does not fail if sync fails).

## Success Checklist

- A run is created from **Dataset Hub → Run / Train** (preferred) or from `make smoke-quickstart` / CLI smoke.
- At least one task reaches `SUCCESS`.
- Plugin execution logs are visible from CLI and UI.
- Lineage edges are visible under **Lifecycle → Lineage** in the Hub.

## Operator vs maintainer Hub nav

- **All roles:** Lifecycle (Datasets, Lifecycle, Models, Lineage), Overview, Settings.
- **Maintainer / admin** (scoped token): **Execution (maintainer)** — Pipelines, Runs, Tasks.
- **Viewer** token: Execution hidden; pin tenant/project and use Dataset Hub for train/run.

## Done

You can now follow [Run Pipeline Guide](../guides/run-pipeline.md).
