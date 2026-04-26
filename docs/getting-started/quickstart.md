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

## Success Checklist

- Pipeline run is created successfully.
- At least one task reaches `SUCCESS`.
- Plugin execution logs are visible from CLI and UI.
- Lineage edges are visible in the lineage view.

## Done

You can now follow [Run Pipeline Guide](../guides/run-pipeline.md).
