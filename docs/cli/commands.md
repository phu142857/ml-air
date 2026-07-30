# MLAir CLI commands

Unified entry point for local development and operations. **Configuration:** [Configuration guide](../configuration.md).

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

## Start / stop stack

```bash
mlair doctor
mlair build              # docker compose build (images only)
mlair start              # docker compose up -d (from existing images)
mlair rebuild            # build then (re)start
mlair health
mlair stop               # docker compose down
```

`mlair build --no-cache` / `mlair rebuild --no-cache` skip the build cache; `mlair start --foreground` / `mlair rebuild --foreground` attach logs.

## Configuration

```bash
mlair config print
mlair start --profile staging
mlair start --config ./mlair.yaml
```

## Trigger runs and logs

```bash
mlair run examples/pipeline.demo.yaml
mlair logs <run_id> --limit 100
```

Environment (optional overrides):

- `ML_AIR_BASE_URL` / `ML_AIR_API_BASE_URL` (default `http://localhost:8080`)
- `ML_AIR_TENANT_ID` (default `default`)
- `ML_AIR_PROJECT_ID` (default `default_project`)
- `ML_AIR_TOKEN` or `ML_AIR_TRACKING_TOKEN`

## Subcommands

| Command | Description |
|---------|-------------|
| `serve` | Start microservice stack (Compose) |
| `stop` | Stop stack |
| `doctor` | Preflight checks |
| `health` | API/UI health probe |
| `config print` | Merged config + env keys |
| `run` | POST /runs from pipeline file |
| `logs` | GET run logs |
| `dev up` | Alias for `serve` |

## Done

See [Quickstart](../getting-started/quickstart.md) for first pipeline run.
Detail pages: [`mlair run`](./run.md), [`mlair logs`](./logs.md), [CLI local development](./dev.md).
