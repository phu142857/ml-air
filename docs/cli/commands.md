# MLAir CLI commands

Public operator CLI. **Configuration:** [Configuration guide](../configuration.md).

Internal developer/CI tooling uses `make` targets (for example `make test-all`, `make verify-deployment-signoff`) — not `mlair`.

## Install

```bash
pip install -e .    # repository root
mlair --version
```

Without install:

```bash
python -m mlair --help
python bin/mlair --help
```

## Public commands

```text
mlair build                 # Build application/images
mlair start                 # Start MLAir services
mlair stop                  # Stop MLAir services
mlair rebuild               # Rebuild and restart services
mlair serve                 # Run development/API server (uvicorn)
mlair doctor                # Check environment and diagnose problems
mlair health                # Check service health
mlair config print          # View merged configuration

mlair run <pipeline.yaml>   # Create an ML run from a pipeline file
mlair logs <run_id>         # View run logs

mlair seed                  # Create primary hub demo data
mlair seed all              # Create all demo seed datasets
mlair remove demo           # Remove demo data (best-effort)

mlair db backup             # Backup PostgreSQL
mlair db restore --file <path>

mlair dev shell|logs|ps     # Compose development helpers
```

## Start / stop stack

```bash
mlair doctor
mlair build
mlair start
mlair health
mlair stop
```

`mlair build --no-cache` / `mlair rebuild --no-cache` skip the build cache.  
`mlair start --foreground` / `mlair rebuild --foreground` attach logs.

## Configuration

```bash
mlair config print
mlair config print --json
mlair start --profile staging
mlair start --config ./mlair.yaml
```

## Runs and logs

```bash
mlair run examples/pipeline.demo.yaml
mlair logs <run_id> --limit 100
```

Environment (optional overrides):

- `ML_AIR_BASE_URL` / `ML_AIR_API_BASE_URL` (default `http://localhost:8080`)
- `ML_AIR_TENANT_ID` (default `default`)
- `ML_AIR_PROJECT_ID` (default `default_project`)
- `ML_AIR_TOKEN` or `ML_AIR_TRACKING_TOKEN`

## Demo data

```bash
mlair seed          # full demo: features, hub, metrics, drift, resolve, governance, global/clusters
mlair seed all      # same as mlair seed
mlair remove demo
```

Seeds include:
- Hub runs (SUCCESS / FAILED / RUNNING), datasets, models, lineage
- Metrics panel, drift/compare (phase5), pipeline resolve UI
- Governance (retention, SIEM, schema registry, notifications)
- **Global / Clusters**: regions (VN, APAC, US), clusters + heartbeats, federation, edge, scheduler placement, replication, DR

Equivalent internal Make targets: `make seed-demo` (full `mlair seed`), `make seed-phase5-demo`, etc.

## Database

```bash
mlair db backup
mlair db backup --output-dir backups/postgres
mlair db restore --file backups/postgres/mlair_YYYYMMDD_HHMMSS.dump
```

## Development

```bash
mlair serve --reload              # API only (requires DB/Redis in .env)
mlair dev ps
mlair dev logs
mlair dev shell
```

## Done

See [Quickstart](../getting-started/quickstart.md). Detail pages: [`mlair run`](./run.md), [`mlair logs`](./logs.md).
