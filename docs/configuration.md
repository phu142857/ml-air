# MLAir configuration

Single reference for installing and running MLAir with **sensible defaults**. The default runtime is an **all-in-one app container** (`ml-air:latest`) plus the supporting local services MLAir needs for a full developer experience: Prometheus, Grafana, and MinIO.

> **Architecture:** Configuration layers and deployment contract are defined in the [Platform Configuration Architecture](config/DESIGN-FREEZE.md) package (Series 002, **Design Freeze v1.0 — CLOSED**). This guide is operator-facing; align with Package 002 during Configuration refactor.

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

Open MLAir at `http://localhost:8080/login` (default). Sign in with bootstrap admin credentials — see [Login and Identity](guides/login-and-identity.md). API (`/v1`), Hub UI, and realtime (`/ws`) share that single origin. The default stack also starts local observability/storage companions on their standard ports: Grafana `:33000`, Prometheus `:39090`, and MinIO console `:9001`. Distributed traces are viewed in the Hub [Trace explorer](guides/use-trace-explorer.md) (sidebar **Traces**, run detail, or `?trace=<id>`).

No `mlair.yaml` required — profile **`development`** applies automatically.

### Single public app port (default)

The all-in-one image runs an internal nginx reverse proxy on **`:8080`**:

| Path | Backend |
|------|---------|
| `/` | Next.js Hub |
| `/v1/*` | FastAPI |
| `/ws` | Realtime WebSocket |
| `/health` | API health |
| `/healthz` | Realtime health |

Override the host mapping with `ports.hub` in `mlair.yaml` or `MLAIR_PORT` in the environment. API, Hub, and realtime are **not** published on separate host ports in this mode; observability/storage companions still expose their own local ports for direct access.

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
| `development` | Local all-in-one app + observability stack (`mlair start`) | on | skipped (dev) |
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
| `ports.api` / `ports.frontend` | infra example (microservices) |
| `ml_air_environment` | infra example / profile |

Identity IAM (see [Login and Identity](guides/login-and-identity.md) and `docs/iam/11-migration-plan.md`):

| Variable | Purpose |
|----------|---------|
| `ML_AIR_IDENTITY_JWT_SECRET` | Human Access JWT signing |
| `ML_AIR_BOOTSTRAP_ADMIN_USERNAME` / `PASSWORD` | One-time Global Admin seed |
| `ML_AIR_LEGACY_STATIC_TOKENS` | `0` = target (no static `*-token`) |
| `ML_AIR_SA_SCHEDULER_SECRET` | Platform scheduler SA bootstrap |
| `ML_AIR_SA_EXECUTOR_SECRET` | Platform executor SA bootstrap |
| `ML_AIR_SA_YOLO_WORKER_SECRET` / `VET` | External worker SAs |

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
  grafana_url: http://localhost:33000
  otel_enabled: true

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

`mlair start` creates `.env` on first run by merging **`.env.example`** (L3 contract, ≤30 keys) and **`deploy/.env.infra.example`** (compose ports, bootstrap creds, scheduler tuning). Policy knobs belong in Hub **System (L4)** or `MLAIR_PROFILE`, not infra env.

### Strict lifecycle (staging / production)

```bash
mlair start --profile production
```

Equivalent to `deploy/env/production-strict.env.example`. Runbook: [Production strict lifecycle](./runbooks/production-strict-lifecycle.md).

### Consume from another repo

Keep using pinned images and `MLAIR_API_IMAGE` — no monorepo submodule. Set profile `staging` or pass env from your compose. See [Consume MLAir from Compose](./guides/consume-mlair-from-compose.md).

## Related docs

- [Platform Architecture Series](architecture/00-platform-architecture-series.md)
- [Package 002 — Platform Configuration](config/DESIGN-FREEZE.md)
- [Installation](./getting-started/installation.md)
- [Quickstart](./getting-started/quickstart.md)
- [Run environment capture](./guides/run-environment.md)
- [CLI commands](./cli/commands.md)
- `.env.example` — L3 deployment contract (groups A–E)
- `deploy/.env.infra.example` — compose ports, image bootstrap, scheduler/executor tuning

## Done

Defaults → `mlair rebuild` → Hub. Customize via profile or `mlair.yaml` only when required.
