# MLAir configuration

Single reference for installing and running MLAir with **sensible defaults**. The default runtime is a **single all-in-one app container** (`ml-air:latest`) on port **8080**. Optional sidecars — **MinIO**, **Prometheus**, and **Grafana** — are **off by default** and start only when enabled in `mlair.yaml` → `infra` (or matching `MLAIR_INFRA_*` env vars).

> Operator-facing reference for installing and running MLAir. Layered config (L0–L5) is implemented in code (`mlair/config/`, Hub System Settings); this guide covers what you set at deploy time.

## Goal

Use MLAir immediately after install. Override only when you need staging/production semantics or the legacy multi-container layout.

## Quick start (zero config file)

```bash
pip install -e .          # from repository root
mlair doctor
mlair build               # build images
mlair start               # start from images
mlair health
```

Open MLAir at `http://localhost:8080/login` (default). Sign in with bootstrap admin credentials — see [Login and Identity](guides/login-and-identity.md). API (`/v1`), Hub UI, and realtime (`/ws`) share that single origin. Distributed traces are viewed in the Hub [Trace explorer](guides/use-trace-explorer.md) (sidebar **Traces**, run detail, or `?trace=<id>`).

No `mlair.yaml` required — profile **`development`** applies automatically. Artifact storage defaults to **local volumes** inside the all-in-one container (`file:///mlair/artifacts/...`).

### Single public app port (default)

The all-in-one image runs an internal nginx reverse proxy on **`:8080`**:

| Path | Backend |
|------|---------|
| `/` | Next.js Hub |
| `/v1/*` | FastAPI |
| `/ws` | Realtime WebSocket |
| `/health` | API health |
| `/healthz` | Realtime health |

Override the host mapping with `ports.hub` in `mlair.yaml` or `MLAIR_PORT` in the environment. API, Hub, and realtime are **not** published on separate host ports in this mode.

### Optional infra sidecars (all-in-one)

MinIO, Prometheus, and Grafana are **optional** Compose profiles. They are **not** started on a plain `mlair start` unless you enable them.

**Recommended** — `mlair.yaml`:

```yaml
infra:
  minio: true
  prometheus: true
  grafana: true

observability:
  grafana_url: http://localhost:33000   # optional; default uses ML_AIR_GRAFANA_PORT
```

Then `mlair rebuild` or `mlair start`. The CLI sets `COMPOSE_PROFILES` and pulls/starts only the enabled images.

| Sidecar | Host port (default) | Purpose |
|---------|---------------------|---------|
| MinIO | API `:9000`, console `:9001` | S3-compatible object storage (`minio://` URIs) |
| Prometheus | `:39090` | Scrape API/scheduler/executor/realtime `/metrics` |
| Grafana | `:33000` | Dashboards under `deploy/monitoring/grafana/` |

**Env mirror** (in `deploy/.env.infra.example`, merged into `.env`):

| Variable | Default | Meaning |
|----------|---------|---------|
| `MLAIR_INFRA_MINIO` | `0` | Start MinIO profile |
| `MLAIR_INFRA_PROMETHEUS` | `0` | Start Prometheus profile |
| `MLAIR_INFRA_GRAFANA` | `0` | Start Grafana profile (auto-enables Prometheus) |
| `ML_AIR_GRAFANA_URL` | — | Hub Grafana links when Grafana is on |
| `ML_AIR_PROMETHEUS_URL` | — | Scripts / drills (optional) |

Enabling `grafana: true` automatically enables Prometheus (Grafana needs a datasource).

### Legacy multi-container layout

```bash
mlair rebuild --profile microservices
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
| `development` | Local all-in-one app (`mlair start`); infra sidecars off by default | on | skipped (dev) |
| `microservices` | Legacy multi-container compose | off | skipped (dev) |
| `staging` | Pre-prod sign-off | on | enforced |
| `production` | Lifecycle OS production | on | enforced |

```bash
mlair start --profile staging
MLAIR_PROFILE=production mlair start
```

### Profile → environment variables

Profiles map to L2 bundles (see `mlair config print`). After Phase 4, **policy keys** resolve **L4 → profile → L1** when `system_settings` is seeded; env aliases for those keys are ignored unless `ML_AIR_CONFIG_ACCEPT_POLICY_ENV=1` (rollback). L3 secrets and compose infra env are unchanged.

| Profile key | Resolved via |
|-------------|----------------|
| `features.*` | L4 `features.*` → profile → L1 (env alias only with rollback flag) |
| `hub.default_route`, `identity.lockout`, `governance.*` | L4 → profile → L1 |
| `ports.hub` | `MLAIR_PORT` (contract) |
| `infra.*` | `MLAIR_INFRA_*`, `COMPOSE_PROFILES` (all-in-one sidecars) |
| `ports.api` / `ports.frontend` | infra example (microservices) |
| `ml_air_environment` | infra example / profile |

Identity IAM (see [Login and Identity](guides/login-and-identity.md)):

| Variable | Purpose |
|----------|---------|
| `ML_AIR_IDENTITY_JWT_SECRET` | Human Access JWT signing |
| `ML_AIR_BOOTSTRAP_ADMIN_USERNAME` / `PASSWORD` | One-time Global Admin seed |
| `ML_AIR_LEGACY_STATIC_TOKENS` | `0` = target (no static `*-token`) |
| `ML_AIR_SA_SCHEDULER_SECRET` | Platform scheduler SA bootstrap |
| `ML_AIR_SA_EXECUTOR_SECRET` | Platform executor SA bootstrap |

External workers use Service Accounts you create in the Hub (no platform bootstrap). Set `ML_AIR_SERVICE_ACCOUNT_TOKEN` or `ML_AIR_SA_WORKER_SECRET` on the worker process.

Boolean values accept YAML `true`/`false` or `1`/`0` in env.

## `mlair.yaml` schema

Copy `mlair.yaml.example` → `mlair.yaml` only when you need overrides.

```yaml
profile: development

ml_air_environment: development

compose:
  file: deploy/docker-compose.allinone.yml

ports:
  hub: 8080

features:
  usage_tracking: true
  resource_monitor: true
  strict_dataset_version_required: true
  strict_dataset_version_all_post_runs: true
  readiness_allow_legacy_fallback: true
  skip_approval_for_promote: true

observability:
  otel_enabled: true

# Optional all-in-one sidecars (off by default — images start only when enabled):
# infra:
#   minio: true
#   prometheus: true
#   grafana: true
# observability:
#   grafana_url: http://localhost:33000

auth:
  tracking_token: ""
```

## CLI commands

| Command | Description |
|---------|-------------|
| `mlair build` | Build images only (`docker compose build`) |
| `mlair start` | Start from existing images (`docker compose up -d`) |
| `mlair rebuild` | Build images then (re)start |
| `mlair stop` | `docker compose down` |
| `mlair doctor` | Preflight (docker, ports, compose) |
| `mlair health` | Wait for API/UI health |
| `mlair config print` | Show merged config |
| `mlair run <file.yaml>` | Trigger pipeline run |
| `mlair logs <run_id>` | Fetch run logs |

Without `pip install`, from repo root:

```bash
python -m mlair rebuild
python bin/mlair doctor
```

## Docker Compose vs single package

| Mode | Command | Runtime |
|------|---------|---------|
| **Recommended local** | `mlair rebuild` | Single all-in-one container on port 8080 |
| **Production** | Pinned ghcr images + compose | Same topology, scaled executor, HA scheduler |
| **SDK / worker only** | `pip install mlair` | `sdk.start_run`, `mlair worker` (external) |

The **Python package is one wheel** (`mlair` + `sdk`). **Processes remain microservices** for scale and blast-radius — the CLI hides compose wiring.

## Advanced overrides

### Secrets and connection strings

Set in environment (not committed):

```bash
export ML_AIR_DATABASE_URL=postgresql://...
export ML_AIR_IDENTITY_JWT_SECRET=...
export ML_AIR_SA_SCHEDULER_SECRET=...
```

`mlair start` creates **project-root `.env`** on first run by merging **`.env.example`** and **`deploy/.env.infra.example`**. Edit **only** `ml-air/.env` — do not copy it into `deploy/`; the CLI passes `--env-file <repo-root>/.env` to Docker Compose (compose paths stay under `deploy/`). Policy knobs belong in Hub **System (L4)** or `MLAIR_PROFILE`, not infra env.

### Strict lifecycle (staging / production)

```bash
mlair start --profile production
```

Equivalent to `deploy/env/production-strict.env.example`. See [Production strict lifecycle](./runbooks/production-strict-lifecycle.md) and `deploy/env/staging-strict.env.example`.

### Consume from another repo

Keep using pinned images and `MLAIR_API_IMAGE` — no monorepo submodule. Set profile `staging` or pass env from your compose. See [Consume MLAir from Compose](./guides/consume-mlair-from-compose.md).

## Related docs

- [Installation](./getting-started/installation.md)
- [Quickstart](./getting-started/quickstart.md)
- [Production deployment](./runbooks/production-deployment.md)
- [Production strict lifecycle](./runbooks/production-strict-lifecycle.md)
- [Production WSS and ingress](./runbooks/production-wss-ingress.md)
- [Run environment capture](./guides/run-environment.md)
- [CLI commands](./cli/commands.md)
- `.env.example` — L3 deployment contract (groups A–E)
- `deploy/.env.infra.example` — compose ports, image bootstrap, scheduler/executor tuning

## Done

Defaults → `mlair rebuild` → Hub. Customize via profile or `mlair.yaml` only when required.
