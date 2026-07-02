# MLAir configuration

Single reference for installing and running MLAir with **sensible defaults**. The default runtime is **one container** (`ml-air:latest`) with API, Hub, scheduler, executor, realtime, PostgreSQL, and Redis.

## Goal

Use MLAir immediately after install. Override only when you need staging/production semantics or the legacy multi-container layout.

## Quick start (zero config file)

```bash
pip install -e .          # from repository root
mlair doctor
mlair serve --build
mlair health
```

Open MLAir at `http://localhost:8080` (default). API (`/v1`), Hub UI, and realtime (`/ws`) share that single origin.

No `mlair.yaml` required — profile **`development`** applies automatically.

### Single public port (default)

The all-in-one image runs an internal nginx reverse proxy on **`:8080`**:

| Path | Backend |
|------|---------|
| `/` | Next.js Hub |
| `/v1/*` | FastAPI |
| `/ws` | Realtime WebSocket |
| `/health` | API health |
| `/healthz` | Realtime health |

Override the host mapping with `ports.hub` in `mlair.yaml` or `MLAIR_PORT` in the environment. API, Hub, and realtime are **not** published on separate host ports in this mode.

### Legacy multi-container layout

```bash
mlair serve --profile microservices --build
```

## Configuration layers (priority)

| Priority | Source | When |
|----------|--------|------|
| 1 (highest) | Shell environment `ML_AIR_*` | Production secrets, CI, K8s |
| 2 | `mlair.yaml` in cwd or `~/.config/mlair/mlair.yaml` | Project / operator overrides |
| 3 | Profile file (`development`, `staging`, `production`) | Environment class |
| 4 (lowest) | Built-in defaults in `mlair` package | Always present |

CLI flags: `--profile staging`, `--config /path/mlair.yaml`, env `MLAIR_PROFILE`, `MLAIR_CONFIG`.

Inspect merged result:

```bash
mlair config print
mlair config print --json
```

## Profiles

Bundled in `mlair/profiles/` (also shipped inside the `mlair` wheel).

| Profile | Use case | Strict dataset pin | Promote approval |
|---------|----------|----------------------|------------------|
| `development` | Local single-container (`mlair serve`) | off | skipped (dev) |
| `microservices` | Legacy multi-container compose | off | skipped (dev) |
| `staging` | Pre-prod sign-off | on | enforced |
| `production` | Lifecycle OS production | on | enforced |

```bash
mlair serve --profile staging
MLAIR_PROFILE=production mlair serve
```

### Profile → environment variables

Profiles map to `ML_AIR_*` keys consumed by API, scheduler, and executor. Examples:

| Profile key | Environment variable |
|-------------|---------------------|
| `features.usage_tracking` | `ML_AIR_USAGE_TRACKING_ENABLED` |
| `features.resource_monitor` | `ML_AIR_RESOURCE_MONITOR_ENABLED` |
| `features.strict_dataset_version_required` | `ML_AIR_STRICT_DATASET_VERSION_REQUIRED` |
| `features.strict_dataset_version_all_post_runs` | `ML_AIR_STRICT_DATASET_VERSION_ALL_POST_RUNS` |
| `features.readiness_allow_legacy_fallback` | `ML_AIR_READINESS_ALLOW_LEGACY_FALLBACK` |
| `features.skip_approval_for_promote` | `ML_AIR_SKIP_APPROVAL_FOR_PROMOTE` |
| `ports.hub` | `MLAIR_PORT` |
| `ports.api` | `ML_AIR_API_PORT` (microservices profile) |
| `ports.frontend` | `ML_AIR_FRONTEND_PORT` (microservices profile) |
| `ml_air_environment` | `ML_AIR_ENVIRONMENT` |
| `auth.tracking_token` | `ML_AIR_TRACKING_TOKEN` |

Boolean values accept YAML `true`/`false` or `1`/`0` in env.

## `mlair.yaml` schema

Copy `mlair.yaml.example` → `mlair.yaml` only when you need overrides.

```yaml
profile: development

ml_air_environment: development

compose:
  file: deploy/docker-compose.quickstart.yml

ports:
  hub: 8080

features:
  usage_tracking: true
  resource_monitor: true
  strict_dataset_version_required: false
  strict_dataset_version_all_post_runs: false
  readiness_allow_legacy_fallback: true
  skip_approval_for_promote: true

observability:
  grafana_url: http://localhost:33000

auth:
  tracking_token: admin-token
```

## CLI commands

| Command | Description |
|---------|-------------|
| `mlair serve` | Start microservice stack via Docker Compose |
| `mlair serve --build` | Rebuild images then start |
| `mlair stop` | `docker compose down` |
| `mlair doctor` | Preflight (docker, ports, compose) |
| `mlair health` | Wait for API/UI health |
| `mlair config print` | Show merged config |
| `mlair run <file.yaml>` | Trigger pipeline run |
| `mlair logs <run_id>` | Fetch run logs |
| `mlair dev up` | Alias for `mlair serve` (backward compatible) |

Without `pip install`, from repo root:

```bash
python -m mlair serve
python bin/mlair doctor
```

## Docker Compose vs single package

| Mode | Command | Runtime |
|------|---------|---------|
| **Recommended local** | `mlair serve` | Compose: api + scheduler + executor + realtime + frontend + postgres + redis |
| **Production** | Pinned ghcr images + compose | Same topology, scaled executor, HA scheduler |
| **SDK / worker only** | `pip install mlair` | `sdk.start_run`, `mlair worker` (external) |

The **Python package is one wheel** (`mlair` + `sdk`). **Processes remain microservices** for scale and blast-radius — the CLI hides compose wiring.

## Advanced overrides

### Secrets and connection strings

Set in environment (not committed):

```bash
export ML_AIR_DATABASE_URL=postgresql://...
export ML_AIR_JWT_HS256_SECRET=...
export ML_AIR_TRACKING_TOKEN=...
```

`mlair serve` creates `.env` from `.env.example` on first run if missing. For production, use secret manager + compose override — see `deploy/env/staging-strict.env.example`.

### Strict lifecycle (staging / production)

```bash
mlair serve --profile production
```

Equivalent to `deploy/env/production-strict.env.example`. Runbook: [Production strict lifecycle](./runbooks/production-strict-lifecycle.md).

### Consume from another repo

Keep using pinned images and `MLAIR_API_IMAGE` — no monorepo submodule. Set profile `staging` or pass env from your compose. See [Consume MLAir from Compose](./guides/consume-mlair-from-compose.md).

## Related docs

- [Installation](./getting-started/installation.md)
- [Quickstart](./getting-started/quickstart.md)
- [Run environment capture](./guides/run-environment.md)
- [CLI commands](./cli/commands.md)
- `.env.example` — Docker-layer env reference (transitional; prefer this doc for mental model)

## Done

Defaults → `mlair serve` → Hub. Customize via profile or `mlair.yaml` only when required.
