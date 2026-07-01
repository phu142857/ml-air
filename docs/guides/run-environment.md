# Run environment capture

## Goal

Every new pipeline run stores a **reproducibility snapshot** in `runs.environment` (JSONB) so operators can answer: *which Python, image, git revision, and host created this run?*

Most fields are **auto-detected** at `POST /runs` time. You only set env vars when auto-detect is wrong for your deployment.

## What gets captured

Capture runs inside the **API process** when `create_run()` inserts the row (not on the executor/worker). The snapshot describes the **orchestrator** that accepted the run.

| Field | Source | Default |
|-------|--------|---------|
| `captured_at` | UTC timestamp at capture | Always |
| `capturer` | Code path label | `mlair-api` |
| `python_version`, `python_implementation` | `sys.version` | Always |
| `platform`, `hostname` | `platform.*` | Always |
| `machine`, `processor`, `cpu_count` | `platform` / `os.cpu_count()` | Always |
| `memory_total_mb` | `/proc/meminfo` (Linux) | When readable |
| `timezone` | `TZ` or system tz | When set |
| `runtime_kind` | `container` / `kubernetes` / `bare_metal` | Auto |
| `ml_air_environment` | `ML_AIR_ENVIRONMENT` | When set in compose |
| `service_name` | `OTEL_SERVICE_NAME` (or aliases) | When set |
| `docker_image` | See [Docker image](#docker-image-zero-config) | Compose default |
| `git` | Live repo or build-time commit | Auto when available |
| `cuda_version`, `gpu_name` | `nvidia-smi` or env | When GPU present |
| `python_packages_digest` | SHA256 of `pip freeze` | On (disable below) |
| `random_seed` | `ML_AIR_RANDOM_SEED` / `PYTHONHASHSEED` | When set |

### Git object shape

```json
{
  "commit": "abc123…",
  "branch": "main",
  "dirty": false,
  "root": "/app",
  "source": "live"
}
```

When the container has no `.git` directory, build-time vars are used:

```json
{
  "commit": "abc123…",
  "branch": "main",
  "source": "build"
}
```

## Docker image (zero-config)

Priority order (first non-empty wins):

1. `ML_AIR_DOCKER_IMAGE`
2. `MLAIR_DOCKER_IMAGE`, `CONTAINER_IMAGE`, `IMAGE_NAME`
3. `MLAIR_IMAGE_REF` (baked at **image build** via Dockerfile `ARG`)
4. `MLAIR_API_IMAGE` / `MLAIR_SCHEDULER_IMAGE` / `MLAIR_EXECUTOR_IMAGE`

**MLAir quickstart** (`deploy/docker-compose.quickstart.yml`) sets:

```yaml
ML_AIR_DOCKER_IMAGE: ${ML_AIR_DOCKER_IMAGE:-deploy-api:latest}
```

and passes `MLAIR_IMAGE_REF` as a Docker build arg so the image is self-describing even without runtime env.

**Vet microservices** compose wires the pinned image automatically:

```yaml
ML_AIR_DOCKER_IMAGE: ${MLAIR_API_IMAGE:-ghcr.io/.../ml-air-api:${MLAIR_IMAGE_TAG:-latest}}
```

No extra operator config is required if you already define `MLAIR_API_IMAGE` / `MLAIR_IMAGE_TAG`.

## Git (zero-config)

Discovery order:

1. `ML_AIR_GIT_ROOT` (explicit override)
2. `/app` if `.git` exists (API container WORKDIR)
3. Current working directory if `.git` exists
4. Parent of `sdk/environment.py` up to first `.git`
5. Build-time: `MLAIR_SOURCE_COMMIT`, `MLAIR_SOURCE_BRANCH` (Docker build args or CI)

### CI / production image build

Pass commit at build time so runs remain traceable without mounting source:

```bash
docker build -f api/Dockerfile \
  --build-arg MLAIR_IMAGE_REF=ghcr.io/org/ml-air-api:v1.2.0 \
  --build-arg MLAIR_SOURCE_COMMIT="$(git rev-parse HEAD)" \
  --build-arg MLAIR_SOURCE_BRANCH="$(git rev-parse --abbrev-ref HEAD)" \
  -t ghcr.io/org/ml-air-api:v1.2.0 .
```

## Optional overrides

| Variable | When to set |
|----------|-------------|
| `ML_AIR_DOCKER_IMAGE` | Override auto image ref (multi-arch, digest pin) |
| `ML_AIR_GIT_ROOT` | Monorepo: point at subtree with `.git` |
| `ML_AIR_CAPTURE_PIP_FREEZE=0` | Skip `pip freeze` digest (faster capture) |
| `ML_AIR_RANDOM_SEED` | Record training seed policy at orchestration layer |
| `MLAIR_CUDA_VERSION` / `CUDA_VERSION` | GPU nodes without `nvidia-smi` in API container |
| `ML_AIR_ENVIRONMENT` | `development` / `staging` / `production` label |
| `OTEL_SERVICE_NAME` | Service identity (default `mlair-api` in compose) |

Full list in [`.env.example`](../../.env.example) §7d.

## View the snapshot

### UI

**Runs → run detail → Overview → Environment**

Shows capturer, deployment label, runtime kind, hardware, image, git, pip digest.

### API

```bash
curl -s -H "Authorization: Bearer $ML_AIR_TRACKING_TOKEN" \
  "http://localhost:8080/v1/tenants/default/projects/default_project/runs/<run_id>" \
  | jq '.environment'
```

### Database

```bash
docker exec ml-air-postgres psql -U mlair -d mlair -c \
  "SELECT run_id, jsonb_pretty(environment) FROM runs ORDER BY created_at DESC LIMIT 1;"
```

## Verify after deploy

1. **Migration** — `alembic current` must include `0036_run_env_trigger_status`.
2. **Create a new run** (runs created before migration have `environment: null`).
3. **Check API response** — `environment` object non-empty; at minimum `python_version`, `platform`, `captured_at`, `runtime_kind`.
4. **Check image** — `docker_image` matches your compose image ref.
5. **Optional git** — if CI passes build args, `git.source` is `"build"` with commit populated.

Quick local test:

```bash
PYTHONPATH=. python -m unittest api.tests.test_environment_collect -v

docker exec ml-air-api python -c \
  "from sdk.environment import collect_environment; import json; print(json.dumps(collect_environment(capturer='mlair-api'), indent=2))"
```

## Limits (by design)

- Snapshot is **orchestrator-side** at run creation. Executor/worker Python/CUDA is **not** merged automatically (future: task-level env from `start_run()`).
- Runs created via idempotent replay of the same `idempotency_key` return the **original** row — environment is not re-captured.
- `python_packages_digest` reflects the **API** virtualenv, not plugin subprocess deps.

## Related

- [Monitor a Run](./monitor-run.md)
- [Resource usage attribution](./usage-attribution.md)
- [Consume MLAir from Compose](./consume-mlair-from-compose.md)

## Done

New runs carry an audit-friendly environment bundle with minimal compose wiring. Override only the env vars in the table when auto-detect is insufficient.
