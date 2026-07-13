# MLAir Helm chart

Baseline chart for running API, scheduler, executor, Redis, Postgres, MinIO, and optional ingress.

## Images

Set `global` / per-service `image.repository` and `image.tag` to your registry (for example `ghcr.io/<org>/ml-air-api` and a pinned SemVer tag). Do not mount this repository’s source tree into consumer clusters; only pull images.

## API environment

| Variable | Purpose |
|----------|---------|
| `ML_AIR_REDIS_URL` | Redis for queues and run logs |
| `ML_AIR_DATABASE_URL` | Postgres for control-plane state |
| `ML_AIR_JWT_HS256_SECRET` | JWT / static auth material (via chart Secret) |
| `ML_AIR_TASK_EXECUTION_MODE` | `internal` (default) or `external` for lease-based workers |
| `ML_AIR_WORKER_TOKEN` | Bearer for `POST /v1/tasks/lease` when using external workers |
| `MLAIR_MODEL_PROMOTE_WEBHOOK_URL` | Optional full URL; API POSTs JSON on successful **model promote** |
| `MLAIR_MODEL_PROMOTE_WEBHOOK_BEARER_TOKEN` | Bearer token for that webhook (both must be set to enable) |
| `MLAIR_MODEL_PROMOTE_WEBHOOK_TIMEOUT_SECONDS` | HTTP timeout (default `15`) |

See root [`README.md`](../../README.md) and [`docs/guides/promote-model.md`](../../docs/guides/promote-model.md).

## Executor / scheduler

Executor commonly needs `ML_AIR_API_BASE_URL` and `ML_AIR_TRACKING_TOKEN` to call back into the API (see chart templates under `templates/` for defaults).

## Install (sketch)

```bash
helm upgrade --install ml-air ./charts/ml-air -f values-staging.yaml
```

Staging strict lifecycle:

```bash
helm upgrade --install ml-air ./charts/ml-air \
  -f values-staging.yaml \
  -f values-staging-strict.yaml
```

Adjust `values-staging.yaml` or your own values file for your cluster and registry.
