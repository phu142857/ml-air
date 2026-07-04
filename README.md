# MLAir

**MLAir is a lifecycle operating system for ML** — a **governance-centric control plane** that anchors training on **immutable dataset versions**, **policy-backed readiness**, **gated runs**, and **model promotion**. **Pipelines are the execution substrate** (DAG, retries, replay), not the product story.

> Not a “mini Airflow + MLflow.” Orchestration and tracking exist **inside** one **`run_id`**, version pin, and audit trail.

Multi-tenant API + Next.js Hub for datasets, readiness, runs, registry, lineage, and observability. **Start here:** [Hub lifecycle-first UX](docs/guides/hub-lifecycle-first.md)

---

## Lifecycle chain (30-second mental model)

```mermaid
flowchart LR
  DV["Dataset version vN<br/>(immutable pin)"]
  RD["Dataset readiness<br/>(policy evaluation)"]
  EL["Training eligibility<br/>(readiness + governance)"]
  EG["Execution gate<br/>(pipeline / runtime)"]
  RUN["Run + tasks<br/>(one run_id)"]
  MD["Model version<br/>(promote / stages)"]

  DV --> RD --> EL --> EG --> RUN --> MD

  subgraph substrate["Execution substrate (not the headline)"]
    PIPE["Pipeline DAG · scheduler · executor"]
  end

  EG -.-> PIPE
  RUN -.-> PIPE
```

**Operator path:** Dataset Hub → **Run / Train** (pinned `dataset_version_id`) → Hub **Runs** / lineage / usage on the same `run_id`. **Maintainer path:** Execution nav for pipeline/run observability only.

---

## What it is

**Problem:** Teams need a single place to anchor training on **versioned data**, evaluate **policy-backed readiness**, trigger **gated runs**, promote models, and audit lineage—without folding lifecycle rules into ad-hoc scripts or treating “latest mutable data” as the training source of truth.

**Who uses it:** Platform / MLOps engineers and product teams that integrate training or ETL via **plugins** and HTTP contracts.

**How it fits:** MLAir owns **lifecycle metadata, orchestration, persistence, auth scope, and audit**. Your application owns **business validation**; plugins are the **adapter boundary**; **pipelines** express **how** work runs, not **what** lifecycle state means.

---

## Current status (checklist)

Use this as a quick “what exists today” view. Notable shipped changes are summarized in [CHANGELOG.md](CHANGELOG.md).

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
- Readiness APIs; training policies; Dataset Hub route `/datasets/[datasetId]`; accumulation strategy matrix [`docs/guides/dataset-accumulation-strategies.md`](docs/guides/dataset-accumulation-strategies.md)
- Search API (`GET /v1/search`) + topbar + `/search` page
- Lineage UI `/lineage` (React Flow; deep-link with run / dataset context)

### Operator UI (Next.js)

- Scope context: tenant / project / token + env-based API base URL
- Routes: `/dashboard`, `/runs`, `/runs/[runId]`, `/pipelines`, `/pipelines/[pipelineId]`, `/pipelines/.../versions`, `/pipelines/.../diff`, `/tasks/[taskId]`, `/models`, `/models/[modelId]`, `/datasets`, `/datasets/[datasetId]`, `/lifecycle`, `/lineage`, `/search`, `/settings`
- DAG visualization, run detail, logs / timeline, error handling patterns
- Custom **SelectDropdown** controls where native `<select>` broke under layout (overflow / sticky / blur); topbar tenant/project pickers use the same pattern

### Observability & ops

- Prometheus metrics on API, scheduler, executor (`/metrics`)
- Grafana dashboards + alert rules in repo (`deploy/monitoring/`), including **MLAir lifecycle (semantic metrics)** (`grafana/dashboards/mlair-lifecycle-semantic.json`: train/readiness/materialization + **model promote / approval** counters)
- Request correlation id (`X-Trace-Id`) through the stack
- Makefile: `make test-prometheus-rules`, `make test-observability`, `make incident-drill`, `make backup-db` / `make restore-db`

### Packaging & CI

- Helm chart `charts/ml-air/`
- CI: build, env sync guard, manifest key rotation guard, **Prometheus alert rule lint** (`make test-prometheus-rules` — `promtool` or Docker), smokes, Helm lint (`make test-all` is the local mirror)

### Operator experience (Hub-first — shipped)

- **Dataset Hub** (`/datasets`) is the default entry; **Run / Train** with pinned **Head snapshot (vN)** / `dataset_version_id`
- **Lifecycle nav:** Datasets, Lifecycle dashboard, Models, Lineage — all roles
- **Execution (maintainer):** Pipelines, Runs, Tasks — observability copy; hidden for viewer tokens ([hub-nav-access](frontend/lib/hub-nav-access.ts))
- Realtime Hub sync (WS + polling fallback): [`docs/runbooks/staging-prod-signoff.md`](docs/runbooks/staging-prod-signoff.md)
- Sign-off automation: `make signoff-local` (wave0 + strict lifecycle + wave1 + scheduler HA)

### Incremental (non-blocking)

- **Durable readiness evaluations** — persisted history + “why blocked” UX refinements
- **Serving-slot HTTP** on `/v1/models/{id}/serving`: data model exists; HTTP handlers commented until re-enabled (`ENABLE_SERVING_SLOTS_UI` off)

### Release hygiene (maintainers)

- Before tagging a milestone: run `mlair rebuild` (or full quickstart) then `make test-all`; confirm migrations on a fresh DB; update `CHANGELOG.md` / release notes; tag and push (see [CONTRIBUTING.md](CONTRIBUTING.md) for DB migrations and review expectations).

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
    direction TB
    UI[Next.js UI]
    APP[Integrating App]
  end

  subgraph mlair[MLAir]
    direction TB
    API[FastAPI API]
    SCH[Scheduler]
    EXE[Executor]
  end

  subgraph storage[Storage]
    direction TB
    PG[(PostgreSQL)]
    RD[(Redis)]
  end

  UI & APP --> API
  API --> PG & RD
  SCH --> PG & RD
  EXE --> RD
  EXE -.->|callback| API
```

### Multi-task pipeline execution

When a pipeline version defines multiple tasks with `depends_on`, the scheduler resolves the DAG and enqueues tasks as their dependencies complete. The executor runs each task as an independent plugin subprocess.

```mermaid
sequenceDiagram
    participant C as Client / Integrating App
    participant API as MLAir API
    participant PG as PostgreSQL
    participant RD as Redis
    participant SCH as Scheduler
    participant EXE as Executor
    participant PLG as Plugin Subprocess

    C->>API: POST /v1/.../runs (pipeline_id, context)
    API->>PG: Insert run + snapshot config_snapshot
    API->>RD: Push run event to mlair:runs:new
    API-->>C: 200 {run_id, status: PENDING, config_snapshot}

    SCH->>RD: Pop run event
    SCH->>PG: Build task plan from config_snapshot.tasks[]
    Note over SCH: DAG: taskA -> taskB -> taskC -> ...

    loop For each task in topological order
        SCH->>PG: Upsert task status = RUNNING
        SCH->>RD: Push task event to priority queue

        EXE->>RD: BLPOP task from queue
        EXE->>PLG: Spawn subprocess (plugin_name, stdin context + run_id)

        Note over PLG: Plugin executes business logic<br/>(HTTP calls, training, ETL, etc.)

        opt Real-time tracking
            PLG->>API: POST /runs/{rid}/metrics (progress)
            PLG->>API: POST /runs/{rid}/params
        end

        PLG-->>EXE: stdout JSON (params, metrics, artifacts, lineage)

        EXE->>API: POST task tracking (metrics, params, artifacts)
        EXE->>API: POST lineage ingest
        EXE->>RD: Push task_finished event

        SCH->>RD: Pop task_finished
        SCH->>PG: Update task status = SUCCESS
        Note over SCH: Check depends_on: all deps SUCCESS?<br/>Enqueue next ready tasks
    end

    SCH->>PG: All tasks SUCCESS -> run status = SUCCESS
    C->>API: GET /runs/{rid} -> tasks timeline + tracking
```

**Key behaviors:**

- **DAG resolution**: tasks only enqueue when all `depends_on` entries are `SUCCESS`
- **Concurrency**: `max_parallel_tasks` (1-20, default 1) controls how many tasks run simultaneously
- **Retry**: failed tasks get exponential backoff retries (configurable `max_attempts`); exhausted tasks go to DLQ
- **Replay**: runs can replay from a specific task, skipping upstream tasks that pass manifest checksum gating
- **Plugin isolation**: each task runs as a separate subprocess; the executor has no awareness of the DAG



**Terminology (glossary — same names in Hub, API, docs):**

| Term | Meaning |
| --- | --- |
| **Dataset readiness** | Version-scoped evaluation against policy (size, freshness, rules) — [`readiness-and-gating.md`](docs/api/readiness-and-gating.md) |
| **Training eligibility** | Readiness **plus** governance and model/dataset policy — gate before train |
| **Execution gate** | Pipeline/runtime checks at run start (`check-readiness`, declared inputs, strict pin) |
| **Materialization** | Buffer → immutable **dataset version** (`vN`) |

Do not alias these to “gate” generically in UI copy. Full contract: [`docs/api/readiness-and-gating.md`](docs/api/readiness-and-gating.md).

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
- **CI / local gates**: env sync, manifest key rotation, **alert rules** (`make test-prometheus-rules`), smokes, Helm (`make test-all`)

---

## Getting started (checklist)

**Prerequisites**

- Docker with Compose v2
- (Optional) Node 18+ and Python 3.11+ for development outside containers

**Install**

```bash
git clone <your-fork-or-mirror>/ml-air.git && cd ml-air
pip install -e .    # unified package: mlair CLI + sdk
```

**Run (recommended)**

```bash
mlair doctor
mlair build
mlair start
mlair health
```

Configuration: [docs/configuration.md](docs/configuration.md) — sensible defaults, optional `mlair.yaml`.

**Verify**

- API + Hub + realtime: `curl -sS http://localhost:8080/health` and open `http://localhost:8080`
- Example API (token from docs / `.env.example`):  
`curl -sS "http://localhost:8080/v1/tenants/default/projects?limit=10" -H "Authorization: Bearer maintainer-token"`

**Defaults:** one container `mlair` on **port 8080** — Hub UI, REST API (`/v1`), and WebSocket realtime (`/ws`) on the same origin. Postgres and Redis run inside the container (no separate compose services).

**Legacy multi-container:** `mlair rebuild --profile microservices` (separate API **8080**, Hub **38080**, realtime **8001**).

**Full operator docs:** [docs/index.md](docs/index.md). **Post-pull DB:** run `cd api && alembic upgrade head` (see [CONTRIBUTING.md](CONTRIBUTING.md) § Database migrations).

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
| `ML_AIR_REQUIRE_DECLARED_DATASET_INPUTS` | When `1`, `POST .../runs`, gated pipeline run, and pipeline `check-readiness` require `override_config.inputs` or version `config.inputs` | `0` (see `docs/api/readiness-and-gating.md`) |
| `ML_AIR_READINESS_ALLOW_LEGACY_FALLBACK` | When `0` (default), dataset readiness/eligibility forbid implicit latest-head if versions exist; `1` restores legacy implicit head + aggregate size fallback | `0` |
| `ML_AIR_STRICT_DATASET_VERSION_REQUIRED` | When `1`, train trigger and declared-inputs run paths require an explicit `dataset_version_id`; `runtime-config.features.strict_dataset_version_required` mirrors | `1` (see `docs/api/dataset-version-immutability.md`) |
| `ML_AIR_STRICT_DATASET_VERSION_ALL_POST_RUNS` | When `1` (default; and strict required is on), generic `POST .../runs`, gated `POST .../pipelines/{id}/run`, and `check-readiness` require a pin even without declared dataset inputs; set `0` for legacy non-dataset pipelines; `runtime-config.features.strict_dataset_version_all_post_runs` mirrors | `1` |
| `ML_AIR_ENABLE_SERVING_SLOTS_HTTP` | When `1`, mount model **serving slot** routes (`GET|PUT .../serving`); `runtime-config.features.serving_slots_http` mirrors for the UI | `0` |
| `NEXT_PUBLIC_API_BASE_URL` | Browser → API base URL (empty = same origin `/v1`) | empty (all-in-one) or `http://localhost:8080` (microservices) |
| `NEXT_PUBLIC_MLAIR_TRAIN_TELEMETRY_URL` | Optional JSON `POST` beacon for train intent (Hub vs pipeline) | empty (disabled) |
| `NEXT_PUBLIC_MLAIR_TRAIN_TELEMETRY_DEBUG` | Log train-intent payloads to browser console (`1` = on) | empty |
| `COMPOSE_FILE`             | Makefile / scripts default compose         | `deploy/docker-compose.allinone.yml`                           |


See `.env.example` for ports (`ML_AIR_*_PORT`), MinIO, Grafana admin defaults, and advanced JWT/JWKS settings.

**Staging / production (Lifecycle OS):** use documented strict env — [`docs/runbooks/production-strict-lifecycle.md`](docs/runbooks/production-strict-lifecycle.md), [`deploy/env/staging-strict.env.example`](deploy/env/staging-strict.env.example), sunset milestones in [`docs/runbooks/legacy-compat-sunset.md`](docs/runbooks/legacy-compat-sunset.md).

---

## API

- **Base path:** `/v1`
- **Contract draft:** [openapi-v1-draft.yaml](openapi-v1-draft.yaml) — aligned with `api/app/api/routes/v1.py` for most paths (model **stages** `staging` / `production` / `archived`, per-version **approval**, **promote**). **Serving-slot** `GET|PUT .../models/{id}/serving` mounts when **`ML_AIR_ENABLE_SERVING_SLOTS_HTTP=1`** (API restart required); the Next.js models UI reads **`GET /v1/runtime-config`** → `features.serving_slots_http` to show slot controls. **Dataset version strictness** for generic run APIs is reflected in **`features.strict_dataset_version_required`** and **`features.strict_dataset_version_all_post_runs`** (Hub Train tab reads the latter for a maintainer notice). **Readiness strictness** is reflected in **`features.readiness_allow_legacy_fallback`** (Hub Readiness tab shows a notice when it is on).
- **Narrative API docs:** [docs/api/](docs/api/)

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

Token model and roles: **Security** section in [docs/index.md](docs/index.md).

---

## Plugin system

- Plugins discovered via Python `**importlib.metadata` entry points** in group `**mlair.plugins`** ([docs/guides/create-plugin.md](docs/guides/create-plugin.md))
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
└── ARCHITECTURE.md      # Longer-form target architecture
```

---

## Quality gates & testing (checklist)

From repo root (stack up where a target requires a live API):

**Stack (unified CLI):**

- `mlair doctor` — preflight (docker, ports, compose file)
- `mlair build` / `mlair start` / `mlair rebuild` / `mlair stop` — images and containers
- `mlair health` — wait for API + Hub health

**Tests & maintainer gates** (Makefile wrappers — see [Makefile](Makefile)):

- `make test-env-sync` — `.env` / `.env.example` drift
- `make test-manifest-key-rotation` — manifest key rotation guard  
- `make test-prometheus-rules` — `promtool check rules` on `deploy/monitoring/alerts/mlair-alerts.yml`  
- `make test-smoke-mlair` — API smoke  
- `make test-smoke-model-registry`  
- `make test-smoke-phase2`  
- `make test-smoke-v03` — lineage / versioning / replay smoke  
- `make test-observability`  
- `make test-helm`  
- `**make test-all**` — runs the full set above, including `test-prometheus-rules` (maintainer bar before release)

Other useful targets: `make seed-demo`, `make backfill-lineage*`, `make enable-ed25519-dev`, `make backup-db` / `make restore-db`. See the [Makefile](Makefile) for the complete list.

---

## Deployment (checklist)

**Local / demo**

- `deploy/docker-compose.quickstart.yml` (build from this repo)

**Production-style**

- Build and publish images (e.g. GitHub Actions `.github/workflows/publish-images.yml` on SemVer tags `v*.*.*`)
- Set `**NEXT_PUBLIC_API_BASE_URL`** for published frontend builds (repository variable / build-arg) to the browser-reachable API URL
- Pin image tag in consumer compose or Kubernetes (e.g. `MLAIR_IMAGE_TAG`)
- Helm: [charts/ml-air/README.md](charts/ml-air/README.md); reference workflow `.github/workflows/deploy-helm-staging.yml`

Operational runbooks: [docs/troubleshooting/](docs/troubleshooting/)

---

## Observability (checklist)

- **Metrics:** scrape `/metrics` on API, scheduler, executor (configs under `deploy/monitoring/`)
- **Dashboards / alerts:** Grafana JSON + alert rules in `deploy/monitoring/`
- **Guides:** [docs/guides/view-metrics.md](docs/guides/view-metrics.md), [docs/guides/setup-prometheus.md](docs/guides/setup-prometheus.md)

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). In short: focused PRs, `make test-env-sync` when env vars change, and smoke / Helm when touching runtime services.

---

## License

Released under the **MIT License** — see [LICENSE](LICENSE). API contract drafts may evolve; consumer-facing changes are summarized in [CHANGELOG.md](CHANGELOG.md).

---

## Further reading


| Document                                                               | Purpose                                        |
| ---------------------------------------------------------------------- | ---------------------------------------------- |
| [docs/index.md](docs/index.md)                                       | All guides (run, gating, plugins, UI, DR)      |
| [CHANGELOG.md](CHANGELOG.md)                                         | Notable API and env changes for integrators    |
| [ARCHITECTURE.md](ARCHITECTURE.md)                                   | Target enterprise architecture                 |
| [docs/plugin-development-guide.md](docs/plugin-development-guide.md) | Plugin packaging & contract                    |


