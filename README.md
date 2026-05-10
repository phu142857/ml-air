# MLAir

Multi-tenant control plane for **pipeline runs**, **model registry**, **datasets / lineage**, **readiness & execution gates**, and **observability**—API-first, with a Next.js operator UI.

---

## What it is

**Problem:** Teams need a single place to register models, version pipelines, trigger runs with guardrails (dataset readiness, execution-time checks, replay policy), and audit what happened—without baking domain training logic into the orchestrator.

**Who uses it:** Platform / MLOps engineers and product teams that integrate training or ETL via **plugins** and HTTP contracts.

**How it fits:** MLAir owns **orchestration, persistence, auth scope, and audit**. Your application (or a separate worker package) owns **business logic**; plugins are the **adapter boundary** between the two.

---

## Current status (checklist)

Use this as a quick “what exists today” view. Detailed delivery history lives in `[ROADMAP.md](ROADMAP.md)`.

### Core platform

- Monorepo: `api/`, `scheduler/`, `executor/`, `frontend/`, `sdk/`, `deploy/`, `charts/ml-air/`, `docs/`
- PostgreSQL system of record (runs, tasks, registry, pipeline versions, lineage, migrations via Alembic)
- Redis-backed queues; stateless executor; dedicated scheduler
- Run/task lifecycle with retries, DLQ replay, transition guards
- Tenant / project scoping on APIs and stored entities
- Auth: dev bearer tokens, JWT (HS256), OAuth2 issuer / JWKS (RS256) where configured
- RBAC enforcement on sensitive paths

### ML tracking & registry

- Experiments, params, metrics, artifacts APIs + SDK helpers
- Model registry (models, versions, promote, rollback flows)
- Plugin → tracking auto-hook after successful plugin runs
- Run compare (API + UI)

### Datasets, lineage, pipelines

- Datasets and `dataset_versions`; lineage ingest and APIs
- `pipeline_versions`, run binding to snapshots, diff API
- Readiness APIs; training policies; Dataset Hub route `/datasets/[datasetId]`
- Search API (`GET /v1/search`) + topbar + `/search` page
- Lineage UI `/lineage` (React Flow; deep-link with run / dataset context)

### Operator UI (Next.js)

- Scope context: tenant / project / token + env-based API base URL
- Routes: `/dashboard`, `/runs`, `/runs/[runId]`, `/pipelines`, `/pipelines/[pipelineId]`, `/pipelines/.../versions`, `/pipelines/.../diff`, `/tasks/[taskId]`, `/models`, `/models/[modelId]`, `/datasets`, `/datasets/[datasetId]`, `/lineage`, `/search`, `/settings`
- DAG visualization, run detail, logs / timeline, error handling patterns
- Custom **SelectDropdown** controls where native `<select>` broke under layout (overflow / sticky / blur); topbar tenant/project pickers use the same pattern

### Observability & ops

- Prometheus metrics on API, scheduler, executor (`/metrics`)
- Grafana dashboards + alert rules in repo (`deploy/monitoring/`)
- Request correlation id (`X-Trace-Id`) through the stack
- Makefile: `make test-observability`, `make incident-drill`, `make backup-db` / `make restore-db`

### Packaging & CI

- Helm chart `charts/ml-air/`
- CI: build, env sync guard, manifest key rotation guard, smokes, Helm lint (`make test-all` is the local mirror)

### In progress / incremental (not a blocker to run the stack)

- **Hub-first lifecycle UX** (Dataset Hub: readiness/eligibility chips, accumulation projections, version-scoped train; pipeline **Execution gate** tools are **hidden by default** for maintainers until **Show execution gate tools** (persisted in `localStorage`), optional `NEXT_PUBLIC_MLAIR_PIPELINE_EXECUTION_GATE_DEFAULT=open` — see `[ROADMAP.md](ROADMAP.md)`. Adoption telemetry from Hub vs pipeline is still optional.)
- **Durable readiness evaluations** (persisted rows + Hub history list + “why blocked” reasons column; Readiness v2 *default evaluation path* without legacy aggregate fallback remains in ROADMAP dataset lifecycle section.)
- **Serving-slot HTTP** on `/v1/models/{id}/serving`: implemented in data model / draft OpenAPI but **handlers commented in `v1.py`** until re-enabled; UI flag `ENABLE_SERVING_SLOTS_UI` stays off by default.

### Release hygiene (maintainers)

- Before tagging a milestone: run `make up` (or full quickstart) then `make test-all`; confirm migrations on a fresh DB; update `CHANGELOG.md` / release notes; tag and push (see checklists inside `[ROADMAP.md](ROADMAP.md)` for v0.2.0 / governance gates).

---

## Architecture


| Component                    | Role                                                                                                                                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **api** (`api/`)             | FastAPI control plane: `/v1` REST, auth, runs, models, datasets, readiness, plugins, lineage, search.                                                                                             |
| **scheduler** (`scheduler/`) | Consumes run events from Redis, plans tasks from `config_snapshot`, enforces parallelism / replay gating, publishes work queues.                                                                  |
| **executor** (`executor/`)   | Pulls tasks from Redis, runs **optional** subprocess plugins (`mlair_runner`), posts manifests / tracking callbacks. Reference image is **stub-oriented** for demos unless you ship real plugins. |
| **frontend** (`frontend/`)   | Next.js UI: scope (tenant/project), runs, pipelines, models, datasets, lineage, search.                                                                                                           |
| **PostgreSQL**               | System of record (runs, tasks, registry, pipeline versions, lineage, etc.).                                                                                                                       |
| **Redis**                    | Queues and run/task coordination.                                                                                                                                                                 |


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



**Terminology (UI / docs):**

- **Dataset readiness** — lifecycle / data readiness at the dataset (and policy) level.
- **Execution gate** — pipeline-side checks and advanced ops (see pipeline **Execution Gate (Advanced)** in UI; narrative: `docs/api/readiness-and-gating.md`).
- **Training eligibility** — combination of readiness, policy, and governance; surfaced in Hub-oriented flows where implemented.

**Design choices (production-minded):**

- **Pipeline versions** with immutable `config` snapshots on runs.
- **Plugin contract validation** on sensitive paths (invalid config → **BLOCKED**, auditable).
- **Manifest / replay** controls for safer re-execution (see `docs/troubleshooting/`).

---

## Feature checklist (capabilities)

- Multi-tenant **runs**, **tasks**, **pipelines** and **pipeline versions** (create, list, diff)
- **Model registry** (create model, versions, promote, delete) + per-version approval where exposed
- **Datasets** and **lineage** APIs + UI (hub page, detail, lineage graph)
- **Readiness** and **run trigger** guardrails (`training_mode`, pipeline overrides, policy hooks)
- **Plugin registry** (entry-point discovery) + validate / reload / toggle endpoints
- **Prometheus** metrics (API, scheduler, executor) + **Grafana** assets in `deploy/monitoring/`
- **Helm** chart for Kubernetes (`charts/ml-air/`)
- **CI / local gates**: env sync, manifest key rotation, smokes, Helm (`make test-all`)

---

## Getting started (checklist)

**Prerequisites**

- Docker with Compose v2
- (Optional) Node 18+ and Python 3.11+ for development outside containers

**Install**

- `git clone <your-fork-or-mirror>/ml-air.git && cd ml-air`
- `cp .env.example .env` and adjust ports if they conflict on your machine

**Run (recommended)**

- `docker compose -f deploy/docker-compose.quickstart.yml up -d --build`

**Verify**

- API: `curl -sS http://localhost:8080/health`
- UI (default from `.env.example`): open `http://localhost:38080`
- Example API (token from docs / `.env.example`):  
`curl -sS "http://localhost:8080/v1/tenants/default/projects?limit=10" -H "Authorization: Bearer maintainer-token"`

**Defaults (`.env.example`):** API **8080**, UI **38080**, Postgres / Redis / MinIO / Prometheus / Grafana wired in the quickstart compose file.

**Full operator docs:** `[docs/index.md](docs/index.md)`

---

## Configuration

Copy `.env.example` → `.env` and keep them in sync when adding variables (**CI enforces** via `make test-env-sync`).


| Variable                   | Purpose                                    | Typical local value                                              |
| -------------------------- | ------------------------------------------ | ---------------------------------------------------------------- |
| `ML_AIR_DATABASE_URL`      | Postgres DSN for API / workers             | `postgresql://mlair:mlair@postgres:5432/mlair` (compose network) |
| `ML_AIR_REDIS_URL`         | Redis for queues                           | `redis://redis:6379/0`                                           |
| `ML_AIR_JWT_HS256_SECRET`  | HS256 JWT for API auth                     | dev secret in `.env.example`                                     |
| `ML_AIR_TRACKING_TOKEN`    | Service token for scheduler/executor → API | `maintainer-token` (example)                                     |
| `ML_AIR_MANIFEST_*`        | Replay / manifest signing policy           | see `.env.example`                                               |
| `NEXT_PUBLIC_API_BASE_URL` | Browser → API base URL                     | `http://localhost:8080`                                          |
| `COMPOSE_FILE`             | Makefile / scripts default compose         | `deploy/docker-compose.quickstart.yml`                           |


See `.env.example` for ports (`ML_AIR_*_PORT`), MinIO, Grafana admin defaults, and advanced JWT/JWKS settings.

---

## API

- **Base path:** `/v1`
- **Contract draft:** `[openapi-v1-draft.yaml](openapi-v1-draft.yaml)` — aligned with `api/app/api/routes/v1.py` for most paths (model **stages** `staging` / `production` / `archived`, per-version **approval**, **promote**). **Serving-slot** paths may remain in the draft while `**GET|PUT .../models/{id}/serving`** is disabled in `v1.py` until re-enabled; UI mirrors this (`ENABLE_SERVING_SLOTS_UI` on model pages).
- **Narrative API docs:** `[docs/api/](docs/api/)`

**Examples**

```bash
curl -sS http://localhost:8080/health

curl -sS http://localhost:8080/v1/plugins \
  -H "Authorization: Bearer maintainer-token"

curl -sS -X POST http://localhost:8080/v1/pipelines/validate \
  -H "Authorization: Bearer maintainer-token" \
  -H "Content-Type: application/json" \
  -d '{"config":{"tasks":[{"id":"train","plugin":"your_plugin_name"}]}}'
```

Token model and roles: **Security** section in `[docs/index.md](docs/index.md)`.

---

## Plugin system

- Plugins discovered via Python `**importlib.metadata` entry points** in group `**mlair.plugins`** (`[docs/guides/create-plugin.md](docs/guides/create-plugin.md)`)
- **Pipeline version `config.tasks[]`** should declare a `**plugin**` per task; API validates on run trigger so misconfiguration fails with `**BLOCKED` / `PLUGIN_NOT_FOUND**`
- **API image** installs `**mlair-reference-plugins`** from `api/builtin_reference_plugins/` (`app_etl_adapter`, `app_train_adapter`, `echo_tracking`, …). Replace or extend in production with your own packages.
- **Executor** runs optional subprocess plugins (`ML_AIR_PLUGIN_RUNNER_MODULE`, default `mlair_runner`). The reference executor suits **orchestration demos**; **real training** belongs in your service or a dedicated plugin package in the executor image.

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
├── sdk/                 # Tracking helpers + model-centric trigger / pipeline mapping
├── openapi-v1-draft.yaml
├── Makefile
├── ROADMAP.md
└── ARCHITECTURE.md      # Longer-form target architecture
```

---

## Quality gates & testing (checklist)

From repo root (stack up where a target requires a live API):

- `make health` — quick compose health probe  
- `make doctor` — diagnostics  
- `make test-env-sync` — `.env` / `.env.example` drift  
- `make test-manifest-key-rotation` — manifest key rotation guard  
- `make test-smoke-mlair` — API smoke  
- `make test-smoke-model-registry`  
- `make test-smoke-phase2`  
- `make test-smoke-v03` — lineage / versioning / replay smoke  
- `make test-observability`  
- `make test-helm`  
- `**make test-all**` — runs the full set above (maintainer bar before release)

Other useful targets: `make seed-demo`, `make backfill-lineage*`, `make enable-ed25519-dev`, `make backup-db` / `make restore-db`. See the `[Makefile](Makefile)` for the complete list.

---

## Deployment (checklist)

**Local / demo**

- `deploy/docker-compose.quickstart.yml` (build from this repo)

**Production-style**

- Build and publish images (e.g. GitHub Actions `.github/workflows/publish-images.yml` on SemVer tags `v*.*.*`)
- Set `**NEXT_PUBLIC_API_BASE_URL`** for published frontend builds (repository variable / build-arg) to the browser-reachable API URL
- Pin image tag in consumer compose or Kubernetes (e.g. `MLAIR_IMAGE_TAG`)
- Helm: `[charts/ml-air/README.md](charts/ml-air/README.md)`; reference workflow `.github/workflows/deploy-helm-staging.yml`

Operational runbooks: `[docs/troubleshooting/](docs/troubleshooting/)`

---

## Observability (checklist)

- **Metrics:** scrape `/metrics` on API, scheduler, executor (configs under `deploy/monitoring/`)
- **Dashboards / alerts:** Grafana JSON + alert rules in `deploy/monitoring/`
- **Guides:** `[docs/guides/view-metrics.md](docs/guides/view-metrics.md)`, `[docs/guides/setup-prometheus.md](docs/guides/setup-prometheus.md)`

---

## Contributing

See `[CONTRIBUTING.md](CONTRIBUTING.md)`. In short: focused PRs, `make test-env-sync` when env vars change, and smoke / Helm when touching runtime services.

---

## License

Released under the **MIT License** — see `[LICENSE](LICENSE)`. API contract drafts may evolve; consumer-facing changes are summarized in `[CHANGELOG.md](CHANGELOG.md)`.

---

## Further reading


| Document                                                               | Purpose                                        |
| ---------------------------------------------------------------------- | ---------------------------------------------- |
| `[docs/index.md](docs/index.md)`                                       | All guides (run, gating, plugins, UI, DR)      |
| `[CHANGELOG.md](CHANGELOG.md)`                                         | Notable API and env changes for integrators    |
| `[ARCHITECTURE.md](ARCHITECTURE.md)`                                   | Target enterprise architecture                 |
| `[ROADMAP.md](ROADMAP.md)`                                             | Delivery milestones + Hub-first migration plan |
| `[docs/plugin-development-guide.md](docs/plugin-development-guide.md)` | Plugin packaging & contract                    |


