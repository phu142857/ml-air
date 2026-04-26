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

If your external service supports startup sync to MLAir registry, enable it with a service-specific flag and optional clinic mapping.

```bash
# Example from Vet-AI bridge
export VETAI_MLAIR_SYNC_MODELS_ON_STARTUP=true
export MLAIR_MODEL_SCOPE_PER_CLINIC=true
export MLAIR_CLINIC_PROJECT_MAP_JSON='{"clinic-a":"project_clinic_a"}'
export MLAIR_CLINIC_TENANT_MAP_JSON='{"clinic-a":"default"}'
```

This hook should be best-effort (startup does not fail if sync fails).

## Success Checklist

- Pipeline run is created successfully.
- At least one task reaches `SUCCESS`.
- Plugin execution logs are visible from CLI and UI.
- Lineage edges are visible in the lineage view.

## Done

You can now follow [Run Pipeline Guide](../guides/run-pipeline.md).
