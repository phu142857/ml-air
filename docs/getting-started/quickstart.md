# Quickstart

## Goal

Boot MLAir locally and run a demo pipeline in minutes.

## Steps

1. Build images.
2. Start services.
3. Verify health.
4. Seed and smoke-check demo run.

## Command

**Recommended (unified CLI):**

```bash
pip install -e .
mlair doctor
mlair rebuild
mlair health
make seed-demo
make smoke-quickstart
```

## Result

You should get a successful smoke run and be able to open MLAir at `http://localhost:8080`.

1. Sign in at **`/login`** (bootstrap admin from `.env`; see [Login and Identity](../guides/login-and-identity.md)).
2. Pin **tenant** and **project** under **Settings** if the sidebar scope is empty.
3. `make smoke-quickstart` obtains a bearer token via `POST /v1/auth/login` when legacy static tokens are off.

## Startup Hooks (External Integrations)

If your external service supports startup sync to the MLAir model registry, enable it with **that service’s own** environment flags and optional project/tenant mapping (names vary by product).

```bash
# Example placeholders — use your bridge’s documented variables instead
export YOUR_APP_MLAIR_SYNC_MODELS_ON_STARTUP=true
export YOUR_APP_MODEL_SCOPE_PER_PROJECT=true
export YOUR_APP_PROJECT_MAP_JSON='{"source-a":"project_a"}'
export YOUR_APP_TENANT_MAP_JSON='{"source-a":"default"}'
```

This hook should be best-effort (startup does not fail if sync fails).

## Success Checklist

- A run is created from **Dataset Hub → Run / Train** (preferred) or from `make smoke-quickstart` / CLI smoke.
- At least one task reaches `SUCCESS`.
- Plugin execution logs are visible from CLI and UI.
- Lineage edges are visible under **Lifecycle → Lineage** in the Hub.
- Optional: open **Traces** or a run-linked trace in the [Trace explorer](../guides/use-trace-explorer.md) when OpenTelemetry is enabled.

## Hub navigation (after login)

- **All signed-in users:** Lifecycle (Datasets, Lifecycle, Models, Lineage), **Traces**, Overview, Settings.
- **Maintainer+** in pinned scope: **Execution** — Pipelines, Runs, Tasks.
- **Viewer** assignment: Execution hidden; use Dataset Hub for train/run.
- **Global Admin:** **Admin** — Users, Service accounts, Audit.

Role comes from tenant/project **assignments**, not from pasting `maintainer-token` in Settings (legacy dual-run only when `ML_AIR_LEGACY_STATIC_TOKENS=1`).

## Done

You can now follow [Run Pipeline Guide](../guides/run-pipeline.md).
