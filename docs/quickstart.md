# ML-AIR Quickstart

## Quickstart v1 (Day 1 baseline)

Target flow:

```bash
git clone <repo>
cd ml-air
cp .env.example .env
make build 
make up
make health
```

This should bring up the full stack and verify service health without manual `docker exec`.

## Start all services

First-time setup:

```bash
cp .env.example .env
```

First-time (build + start):

```bash
make rebuild
```

Next runs (start only, no build):

```bash
make up
```

`api` service runs `alembic upgrade head` on startup before serving requests.

Optional (managed manifest keys for local dev):

```bash
make init-manifest-keys-local
```

Then switch `.env` to file provider when needed:

```bash
ML_AIR_MANIFEST_KEY_PROVIDER=file
ML_AIR_MANIFEST_MANAGED_KEYS_FILE=deploy/security/manifest-keys.local.json
```

## Preflight checks (recommended)

```bash
make doctor
```

## Check full stack health

```bash
make health
```

## Check API health only

```bash
curl http://localhost:8080/health
```

## Default auth tokens (dev)

- `viewer-token`: read-only
- `maintainer-token`: read + trigger + replay
- `admin-token`: full access

## JWT (HS256) option

`api` accepts JWT Bearer tokens when `ML_AIR_JWT_HS256_SECRET` is set.

Required JWT claims:

- `role`: `viewer|maintainer|admin`
- `tenant_id`: tenant scope
- `project_ids`: list of allowed projects (or `"*"`)
- `iat`, `exp`

## JWT (RS256 + JWKS) option

Set these env vars for API:

- `ML_AIR_JWT_JWKS_URL`: OAuth2/OIDC JWKS endpoint
- `ML_AIR_JWT_ISSUER`: expected issuer (optional but recommended)
- `ML_AIR_JWT_AUDIENCE`: expected audience (optional but recommended)
- `ML_AIR_JWT_JWKS_CACHE_TTL_SECONDS`: JWKS cache TTL (default `300`)

## Open UI

- Open [http://localhost:38080](http://localhost:38080)
- Use the Runs Dashboard table to select a run and inspect timeline/logs.

## Call a sample v1 endpoint

```bash
curl -H "Authorization: Bearer maintainer-token" \
  "http://localhost:8080/v1/tenants/default/projects?limit=10"
```

## Trigger a run (API -> scheduler -> executor)

```bash
curl -X POST "http://localhost:8080/v1/tenants/default/projects/default_project/runs" \
  -H "Content-Type: application/json" \
  -d '{"pipeline_id":"demo_pipeline","idempotency_key":"demo-001","priority":"high","max_parallel_tasks":1}'
```

## Watch scheduler/executor logs

```bash
docker compose -f deploy/docker-compose.quickstart.yml logs -f scheduler executor
```

## Validate observability stack

```bash
make test-observability
```

## Plugin runtime quick check

```bash
curl -H "Authorization: Bearer viewer-token" \
  "http://localhost:8080/v1/plugins"
```

## Read run and task status

```bash
curl "http://localhost:8080/v1/tenants/default/projects/default_project/runs/<run_id>"
curl "http://localhost:8080/v1/tenants/default/projects/default_project/runs/<run_id>/tasks"
curl "http://localhost:8080/v1/tenants/default/projects/default_project/runs/<run_id>/logs"
```

## Tracking APIs quick check

```bash
curl -X POST "http://localhost:8080/v1/tenants/default/projects/default_project/experiments" \
  -H "Authorization: Bearer maintainer-token" \
  -H "Content-Type: application/json" \
  -d '{"name":"baseline-exp","description":"first experiment"}'

curl -X POST "http://localhost:8080/v1/tenants/default/projects/default_project/runs/<run_id>/params" \
  -H "Authorization: Bearer maintainer-token" \
  -H "Content-Type: application/json" \
  -d '{"key":"lr","value":"0.001"}'

curl -X POST "http://localhost:8080/v1/tenants/default/projects/default_project/runs/<run_id>/metrics" \
  -H "Authorization: Bearer maintainer-token" \
  -H "Content-Type: application/json" \
  -d '{"key":"accuracy","value":0.95,"step":1}'

curl "http://localhost:8080/v1/tenants/default/projects/default_project/runs/<run_id>/tracking" \
  -H "Authorization: Bearer viewer-token"
```

## Model registry quick check

```bash
curl -X POST "http://localhost:8080/v1/tenants/default/projects/default_project/models" \
  -H "Authorization: Bearer maintainer-token" \
  -H "Content-Type: application/json" \
  -d '{"name":"demo-model","description":"baseline model"}'

curl -X POST "http://localhost:8080/v1/tenants/default/projects/default_project/models/<model_id>/versions" \
  -H "Authorization: Bearer maintainer-token" \
  -H "Content-Type: application/json" \
  -d '{"artifact_uri":"s3://mlair/demo-model/v1/model.pkl","stage":"staging"}'

curl -X POST "http://localhost:8080/v1/tenants/default/projects/default_project/models/<model_id>/promote" \
  -H "Authorization: Bearer maintainer-token" \
  -H "Content-Type: application/json" \
  -d '{"version":1,"stage":"production"}'
```

## Run model registry smoke test

```bash
make test-smoke-model-registry
```

## Run full Phase 2 smoke (tracking + compare + registry)

```bash
make test-smoke-phase2
```

## Backfill lineage from manifests (optional)

Use this after enabling lineage/signature features on an existing environment to rebuild missing `lineage_edges` from stored manifest payloads:

```bash
make backfill-lineage
```

This command runs inside the `api` container, so you do not need local Python dependency setup.

## Stream logs via WebSocket

```bash
python - <<'PY'
import asyncio
import websockets

RUN_ID = "<run_id>"
URL = f"ws://localhost:8080/v1/tenants/default/projects/default_project/runs/{RUN_ID}/logs/ws"

async def main():
    async with websockets.connect(URL) as ws:
        for _ in range(5):
            print(await ws.recv())

asyncio.run(main())
PY
```

## Validate retry/backoff

```bash
curl -X POST "http://localhost:8080/v1/tenants/default/projects/default_project/runs" \
  -H "Content-Type: application/json" \
  -d '{"pipeline_id":"fail_once_pipeline","idempotency_key":"demo-retry-001"}'
```

## Validate DLQ and replay

```bash
curl -X POST "http://localhost:8080/v1/tenants/default/projects/default_project/runs" \
  -H "Content-Type: application/json" \
  -d '{"pipeline_id":"always_fail_pipeline","idempotency_key":"demo-dlq-001"}'

curl -X POST "http://localhost:8080/v1/tenants/default/projects/default_project/runs/<run_id>/dlq/replay"
```

## Stop services

```bash
make down
```
