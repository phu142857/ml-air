# ML-AIR Quickstart

## Start all services

```bash
docker compose -f deploy/docker-compose.quickstart.yml up -d --build
```

`api` service runs `alembic upgrade head` on startup before serving requests.

## Check API health

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
docker compose -f deploy/docker-compose.quickstart.yml down
```
