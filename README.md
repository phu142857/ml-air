# MLAir

Multi-tenant control plane for **pipeline runs**, **model registry**, **datasets / lineage**, **readiness gating**, and **observability**—API-first, with a Next.js operator UI.

---

## Overview

**Problem:** Teams need a single place to register models, version pipelines, trigger runs with guardrails (readiness, replay policy), and audit what happened—without baking domain training logic into the orchestrator.

**Who uses it:** Platform / MLOps engineers and product teams that integrate their training or ETL via **plugins** and HTTP contracts.

**How it fits:** MLAir owns **orchestration, persistence, auth scope, and audit**. Your application (or a separate worker package) owns **business logic**; plugins are the **adapter boundary** between the two.

---

## Architecture

| Component | Role |
|-----------|------|
| **api** (`api/`) | FastAPI control plane: `/v1` REST, auth, runs, models, datasets, readiness, plugins. |
| **scheduler** (`scheduler/`) | Consumes run events from Redis, plans tasks from `config_snapshot`, enforces parallelism / replay gating, publishes work queues. |
| **executor** (`executor/`) | Pulls tasks from Redis, executes **optional** subprocess plugins (`mlair_runner`), posts manifests / tracking callbacks. Reference image is **stub-oriented** for demos unless you ship real plugins. |
| **frontend** (`frontend/`) | Next.js UI: scope (tenant/project), runs, pipelines, models, datasets. |
| **PostgreSQL** | System of record (runs, tasks, registry, pipeline versions, lineage, etc.). |
| **Redis** | Queues and run/task coordination. |

**Data flow (simplified):** Client → API creates **Run** (+ optional pipeline version snapshot) → scheduler schedules **Tasks** → executor completes tasks → API/UI reflect status, metrics, lineage.

```mermaid
flowchart LR
  subgraph clients[Clients]
    UI[Next.js UI]
    APP[Integrating app]
  end
  subgraph mlair[MLAir]
    API[FastAPI API]
    SCH[Scheduler]
    EXE[Executor]
  end
  PG[(PostgreSQL)]
  RD[(Redis)]

  UI --> API
  APP --> API
  API --> PG
  API --> RD
  SCH --> RD
  SCH --> PG
  EXE --> RD
  EXE --> API
```

**Design choices (production-minded):**

- **Tenant / project** scoping on APIs and stored entities.
- **Pipeline versions** with immutable `config` snapshots on runs.
- **Readiness & gating** before expensive work (see `docs/api/readiness-and-gating.md`).
- **Plugin contract validation** on sensitive paths (invalid config → **BLOCKED**, auditable).
- **Manifest / replay** controls for safer re-execution (see `docs/troubleshooting/`).

---

## Features

- Multi-tenant **runs**, **tasks**, **pipelines** & **pipeline versions**
- **Model registry** (create model, versions, promote, delete)
- **Datasets** & **lineage** APIs + UI flows
- **Readiness checks** and **run gating** (`training_mode`, `override_config`)
- **Plugin registry** (entry-point discovery) + validate / reload endpoints
- **Prometheus metrics** (API, scheduler, executor) + **Grafana** assets in `deploy/monitoring/`
- **Helm chart** for Kubernetes (`charts/ml-air/`)
- **CI**: syntax, env sync guard, manifest key checks, smoke tests, Helm lint

---

## Getting Started

**Goal:** API + UI up locally in a few minutes.

### Prerequisites

- Docker with Compose v2
- (Optional) Node 18+ and Python 3.11+ if you develop outside containers

### Installation

```bash
git clone <your-fork-or-mirror>/ml-air.git
cd ml-air
cp .env.example .env
# Edit .env if ports conflict with other stacks on your machine
```

### Run (recommended)

```bash
docker compose -f deploy/docker-compose.quickstart.yml up -d --build
```

### Verify

```bash
# API
curl -sS http://localhost:8080/health

# UI (default from .env.example)
open http://localhost:38080   # or visit in browser

# Example: list projects (use a token from docs / .env.example)
curl -sS "http://localhost:8080/v1/tenants/default/projects?limit=10" \
  -H "Authorization: Bearer maintainer-token"
```

**Defaults (from `.env.example`):** API on host port **8080**, UI on **38080**, Postgres/Redis/MinIO/Prometheus/Grafana wired in the quickstart compose file.

**Full operator docs:** start at [`docs/index.md`](docs/index.md) (installation, guides, troubleshooting, API pages).

---

## Configuration

Copy `.env.example` → `.env` and keep them in sync when adding variables (CI enforces via `make test-env-sync`).

| Variable | Purpose | Typical local value |
|----------|---------|---------------------|
| `ML_AIR_DATABASE_URL` | Postgres DSN for API / workers | `postgresql://mlair:mlair@postgres:5432/mlair` (in compose network) |
| `ML_AIR_REDIS_URL` | Redis for queues | `redis://redis:6379/0` |
| `ML_AIR_JWT_HS256_SECRET` | HS256 JWT for API auth | dev secret in `.env.example` |
| `ML_AIR_TRACKING_TOKEN` | Service token for scheduler/executor → API | `maintainer-token` (example) |
| `ML_AIR_MANIFEST_*` | Replay / manifest signing policy | see `.env.example` |
| `NEXT_PUBLIC_API_BASE_URL` | Browser → API base URL | `http://localhost:8080` |
| `COMPOSE_FILE` | Makefile / scripts default compose | `deploy/docker-compose.quickstart.yml` |

See `.env.example` for ports (`ML_AIR_*_PORT`), MinIO, Grafana admin defaults, and advanced JWT/JWKS settings.

---

## API

- **Base path:** `/v1`
- **Contract draft:** [`openapi-v1-draft.yaml`](openapi-v1-draft.yaml) — aligned with `api/app/api/routes/v1.py` for most paths (e.g. model **stages** `staging` / `production` / `archived`, **per-version approval** `GET|PUT .../versions/{v}/approval`, **promote**). **Serving-slot** paths remain in the draft and **`model_serving_slots`** exists after migration `0013`, but the **`GET|PUT .../models/{id}/serving`** HTTP handlers are **commented out in `v1.py`** until the feature is turned back on; the product UI gates the same (`ENABLE_SERVING_SLOTS_UI` in the models pages).
- **Narrative API docs:** [`docs/api/`](docs/api/)

**Examples:**

```bash
# Health (no auth)
curl -sS http://localhost:8080/health

# Plugins (requires bearer token)
curl -sS http://localhost:8080/v1/plugins \
  -H "Authorization: Bearer maintainer-token"

# Validate pipeline task plugins exist in registry
curl -sS -X POST http://localhost:8080/v1/pipelines/validate \
  -H "Authorization: Bearer maintainer-token" \
  -H "Content-Type: application/json" \
  -d '{"config":{"tasks":[{"id":"train","plugin":"your_plugin_name"}]}}'
```

Token model and roles are documented under **Security** in [`docs/index.md`](docs/index.md).

---

## Plugin system

- Plugins are discovered via Python **`importlib.metadata` entry points** in group **`mlair.plugins`** (see [`docs/guides/create-plugin.md`](docs/guides/create-plugin.md)).
- **Pipeline version `config.tasks[]`** should declare a **`plugin`** per task; the API validates this on run trigger (and related paths) so misconfigured pipelines fail fast with **`BLOCKED` / `PLUGIN_NOT_FOUND`** instead of silent bad runs.
- The **API image** installs **`mlair-reference-plugins`** from `api/builtin_reference_plugins/`, which registers **`app_etl_adapter`**, **`app_train_adapter`**, and **`echo_tracking`** for a **reference demo DAG** and other built-in examples. Replace or extend with your own installable plugin packages in production.
- The **executor** runs optional subprocess plugins (`ML_AIR_PLUGIN_RUNNER_MODULE`, default `mlair_runner`). The shipped reference executor is suitable for **orchestration demos**; **real training** belongs in your service or a dedicated plugin package you install into the executor image.

---

## Project structure

```
ml-air/
├── api/                 # FastAPI app, Alembic migrations, plugin registry
├── scheduler/           # Run/task scheduling loop
├── executor/            # Task worker (stub + optional plugin runner)
├── frontend/            # Next.js UI
├── deploy/              # docker-compose, Prometheus/Grafana assets
├── charts/ml-air/       # Helm chart
├── docs/                # Task-oriented guides & API reference
├── scripts/             # Smoke tests, gates, maintenance
├── sdk/                 # Small helpers: tracking + model-centric trigger / pipeline-mapping
├── openapi-v1-draft.yaml
├── Makefile
├── ROADMAP.md
└── ARCHITECTURE.md      # Longer-form target architecture
```

---

## Testing

From repo root (with stack up or as documented per target):

```bash
make health                 # quick compose health probe
make test-smoke-mlair       # API smoke
make test-smoke-model-registry
make test-smoke-phase2
make test-smoke-v03
make test-observability     # if wired in your Makefile target list
make test-helm
make test-all               # env sync + manifest rotation + smokes + observability + helm
```

Use `make doctor` for diagnostics. See `Makefile` for additional targets (`day6-check`, `seed-demo`, etc.).

---

## Deployment

**Local / demo:** `deploy/docker-compose.quickstart.yml` (builds from this repo).

**Production-style:**

1. **Build & publish images** via GitHub Actions (`.github/workflows/publish-images.yml`)—typically on SemVer tags `v*.*.*`.
2. **Frontend bundle URL:** set the repository variable **`NEXT_PUBLIC_API_BASE_URL`** in GitHub (Settings → Secrets and variables → Actions → Variables) to the browser-reachable API base (for example `https://api.example.com`). It is passed as a Docker build-arg so the Next.js client is not stuck on `localhost:8080` in published images.
3. **Pull by tag** in your environment compose or Kubernetes (e.g. consumer stack pins `MLAIR_IMAGE_TAG`).
4. **Helm:** `charts/ml-air/` — see [`charts/ml-air/README.md`](charts/ml-air/README.md) and workflow `.github/workflows/deploy-helm-staging.yml` as a reference pattern.

Operational runbooks live under [`docs/troubleshooting/`](docs/troubleshooting/).

---

## Observability

- **Metrics:** `/metrics` on API, scheduler, executor (Prometheus scrape configs in `deploy/monitoring/`).
- **Dashboards / alerts:** Grafana dashboard JSON and alert rules under `deploy/monitoring/`.
- **Guides:** [`docs/guides/view-metrics.md`](docs/guides/view-metrics.md), [`docs/guides/setup-prometheus.md`](docs/guides/setup-prometheus.md).

---

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md). In short: focused PRs, `make test-env-sync` when env vars change, and smoke/Helm checks when touching runtime services.

---

## License

Released under the **MIT License** — see [`LICENSE`](LICENSE). API contract drafts may evolve; consumer-facing changes are summarized in [`CHANGELOG.md`](CHANGELOG.md).

---

## Further reading

| Document | Purpose |
|----------|---------|
| [`docs/index.md`](docs/index.md) | All guides (run, gating, plugins, UI, DR) |
| [`CHANGELOG.md`](CHANGELOG.md) | Notable API and env changes for integrators |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Target enterprise architecture |
| [`ROADMAP.md`](ROADMAP.md) | Delivery milestones |
| [`docs/plugin-development-guide.md`](docs/plugin-development-guide.md) | Plugin packaging & contract |
