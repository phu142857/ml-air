# MLAir Helm chart

Baseline chart for running API, scheduler, executor, realtime, Redis, Postgres, MinIO, and optional ingress.

**Operator runbooks:** [Production deployment](../../docs/runbooks/production-deployment.md), [Strict lifecycle](../../docs/runbooks/production-strict-lifecycle.md), [WSS ingress](../../docs/runbooks/production-wss-ingress.md).

## Images

Set `global` / per-service `image.repository` and `image.tag` to your registry. This repository publishes:

| Service | Image |
|---------|--------|
| API | `ghcr.io/phu142857/ml-air-api:<tag>` |
| Frontend | `ghcr.io/phu142857/ml-air-frontend:<tag>` |
| Scheduler | `ghcr.io/phu142857/ml-air-scheduler:<tag>` |
| Executor | `ghcr.io/phu142857/ml-air-executor:<tag>` |
| Realtime | `ghcr.io/phu142857/ml-air-realtime:<tag>` |

Replace `phu142857` with your GitHub org. Build tags via `.github/workflows/publish-images.yml` on `v*.*.*` tags.

Do not mount this repository's source tree into consumer clusters; only pull images.

Frontend builds require `NEXT_PUBLIC_API_BASE_URL` at **image build time** (see publish workflow).

## API environment

| Variable | Purpose |
|----------|---------|
| `ML_AIR_REDIS_URL` | Redis for queues and run logs |
| `ML_AIR_DATABASE_URL` | Postgres for control-plane state |
| `ML_AIR_JWT_HS256_SECRET` | JWT / static auth material (via chart Secret) |
| `ML_AIR_RUNTIME_REALTIME_BASE_URL` | Browser WSS URL (`api.env.runtimeRealtimeBaseUrl` in values) |
| `ML_AIR_TASK_EXECUTION_MODE` | `internal` (default) or `external` for lease-based workers |
| `ML_AIR_WORKER_TOKEN` | Bearer for `POST /v1/tasks/lease` when using external workers |
| `MLAIR_MODEL_PROMOTE_WEBHOOK_URL` | Optional full URL; API POSTs JSON on successful **model promote** |
| `MLAIR_MODEL_PROMOTE_WEBHOOK_BEARER_TOKEN` | Bearer token for that webhook (both must be set to enable) |
| `MLAIR_MODEL_PROMOTE_WEBHOOK_TIMEOUT_SECONDS` | HTTP timeout (default `15`) |

See root [`README.md`](../../README.md) and [`docs/guides/promote-model.md`](../../docs/guides/promote-model.md).

## Executor / scheduler

Executor commonly needs `ML_AIR_API_BASE_URL` and `ML_AIR_TRACKING_TOKEN` to call back into the API (see chart templates under `templates/` for defaults).

## Install

**Staging:**

```bash
helm upgrade --install ml-air ./charts/ml-air \
  -f charts/ml-air/values-staging.yaml \
  -f charts/ml-air/values-staging-strict.yaml
```

**Production:**

```bash
helm upgrade --install ml-air ./charts/ml-air \
  -f charts/ml-air/values-production.yaml \
  -f charts/ml-air/values-production-strict.yaml
```

Adjust registry, `ingress.host`, and `api.env.runtimeRealtimeBaseUrl` for your cluster. Reference CI: `.github/workflows/deploy-helm-staging.yml`.

## Sign-off

After install:

```bash
export ML_AIR_BASE_URL=https://mlair.example.com
python scripts/verify_operator_signoff.py
python scripts/verify_operator_signoff.py --strict
python scripts/verify_execution_realtime.py
```

See [Production deployment](../../docs/runbooks/production-deployment.md).
