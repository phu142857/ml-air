# Production deployment

## Goal

Deploy MLAir to staging or production using **documented artifacts only** — no need to read application source. Choose **all-in-one** (single image) or **Helm microservices** (Kubernetes).

## Prerequisites

| Item | Notes |
|------|--------|
| Postgres | Control-plane state |
| Redis | Queues, run logs, semantic event fan-out |
| Secrets manager | JWT, SA secrets, DB URL (not committed) |
| Container registry | Pin images by **SemVer tag** or digest |
| TLS ingress | Required for production browsers (HTTPS + WSS) |

Image naming from this repository's CI (replace `phu142857/ml-air` with your `owner/repo`):

| Topology | Image pattern | Workflow |
|----------|---------------|----------|
| **All-in-one** | `ghcr.io/phu142857/ml-air:<tag>` | `.github/workflows/release-image.yml` |
| **Microservices** | `ghcr.io/phu142857/ml-air-{api,frontend,scheduler,executor,realtime}:<tag>` | `.github/workflows/publish-images.yml` |

Tags: `vX.Y.Z` on release, `edge` on `main`, or `latest` on semver tags.

## Path A — All-in-one (VM / single host)

Best for: pilot, internal demo, small teams, one public port.

### Steps

1. Clone for CLI + compose wiring (no build required when pulling images).
2. Install the `mlair` CLI.
3. Configure `.env` from examples + production overlay.
4. Pull pinned image and start.
5. Run operator sign-off scripts.

### Commands

```bash
git clone https://github.com/phu142857/ml-air.git
cd ml-air
pip install -e .

# Merge deployment contract + infra + production strict overlay (optional)
cp .env.example .env
cat deploy/.env.infra.example >> .env
# For production strict lifecycle, also merge:
# cat deploy/env/production-strict.env.example >> .env

# Edit secrets: ML_AIR_IDENTITY_JWT_SECRET, bootstrap admin password, SA secrets, DATABASE_URL if external
export MLAIR_IMAGE=ghcr.io/phu142857/ml-air:v1.0.0   # pin SemVer — never :latest in prod
export MLAIR_PORT=8080

mlair start --pull
mlair health
```

Set browser-reachable realtime URL when Hub is not on localhost — see [Production WSS and ingress](./production-wss-ingress.md).

### Result

- Hub + API + realtime on one origin (`http(s)://host:8080` by default).
- Migrations run inside the container on startup.
- `mlair health` exits 0.

## Path B — Helm (Kubernetes)

Best for: HA API/scheduler/executor, external secrets, ingress TLS.

### Steps

1. Publish or pull microservice images (`publish-images` workflow).
2. Create namespace and secrets (`ML_AIR_JWT_HS256_SECRET`, DB, Redis).
3. Customize `values-production.yaml` (registry, host, WSS URL).
4. Install with strict overlay if required.
5. Verify health and sign-off.

### Commands

```bash
# From repository root — adjust registry owner and tag
export IMAGE_TAG=v1.0.0
export GHCR_OWNER=phu142857

kubectl create namespace ml-air-prod

helm upgrade --install ml-air ./charts/ml-air \
  --namespace ml-air-prod \
  -f charts/ml-air/values-production.yaml \
  -f charts/ml-air/values-production-strict.yaml \
  --set frontend.image.repository=ghcr.io/${GHCR_OWNER}/ml-air-frontend \
  --set api.image.repository=ghcr.io/${GHCR_OWNER}/ml-air-api \
  --set scheduler.image.repository=ghcr.io/${GHCR_OWNER}/ml-air-scheduler \
  --set executor.image.repository=ghcr.io/${GHCR_OWNER}/ml-air-executor \
  --set realtime.image.repository=ghcr.io/${GHCR_OWNER}/ml-air-realtime \
  --set frontend.image.tag=${IMAGE_TAG} \
  --set api.image.tag=${IMAGE_TAG} \
  --set scheduler.image.tag=${IMAGE_TAG} \
  --set executor.image.tag=${IMAGE_TAG} \
  --set realtime.image.tag=${IMAGE_TAG} \
  --set api.env.runtimeRealtimeBaseUrl=wss://mlair.example.com/ws \
  --set ingress.host=mlair.example.com \
  --wait --timeout 10m
```

Reference CI job: `.github/workflows/deploy-helm-staging.yml` (staging values + secret wiring).

Frontend image **must** be built with `NEXT_PUBLIC_API_BASE_URL` matching the browser-reachable API URL (build-arg in `publish-images.yml`).

### Result

- Services run as separate Deployments (api, scheduler, executor, realtime, frontend).
- Ingress terminates TLS; WebSocket proxy timeouts configured in `values-production.yaml`.
- Strict lifecycle env applied when `values-production-strict.yaml` is merged.

## Path C — Decoupled Compose (consumer repo)

Your application stack references **pinned images** only — no bind-mount of MLAir source. See [Consume MLAir from Compose](../guides/consume-mlair-from-compose.md).

## Environment merge order

| Layer | File / source | Purpose |
|-------|----------------|---------|
| 1 | `.env.example` | L3 contract (DB, Redis, identity, SA bootstrap) |
| 2 | `deploy/.env.infra.example` | Compose ports, scheduler tuning |
| 3 | `deploy/env/staging-strict.env.example` or `production-strict.env.example` | Strict lifecycle overlay |
| 4 | Secret manager / `mlair.yaml` | Profile, infra sidecars, overrides |

Full reference: [Configuration](../configuration.md).

## Production checklist

### Before cutover

- [ ] Pin image tag or digest (not floating `latest`).
- [ ] Rotate bootstrap admin password; restrict Global Admin accounts.
- [ ] Set `ML_AIR_LEGACY_STATIC_TOKENS=0`.
- [ ] Configure `ML_AIR_RUNTIME_REALTIME_BASE_URL` (WSS) — [runbook](./production-wss-ingress.md).
- [ ] Enable strict lifecycle if required — [runbook](./production-strict-lifecycle.md).
- [ ] Scrape `/metrics` (API, scheduler, executor, realtime) — [Setup Prometheus](../guides/setup-prometheus.md).
- [ ] Plan backup for Postgres — [Backup and restore](../troubleshooting/backup-restore.md).

### After deploy

```bash
export ML_AIR_BASE_URL=https://mlair.example.com
python scripts/verify_operator_signoff.py
python scripts/verify_operator_signoff.py --strict   # when strict lifecycle enabled
python scripts/verify_execution_realtime.py
python scripts/verify_deployment_signoff.py          # maintainer / release gate
```

Optional maintainer bar before tagging: `make test-all`.

### Smoke (operator)

1. Sign in at `/login` — [Login and Identity](../guides/login-and-identity.md).
2. Pin tenant/project in Settings.
3. Trigger a demo run (`make smoke-quickstart` against the deployed URL, or Hub **Run / Train**).
4. Confirm run reaches `SUCCESS`; open **Traces** if OTLP enabled.

## Troubleshooting

| Symptom | Check |
|---------|--------|
| Hub loads but API 401 | Identity JWT secret mismatch across replicas |
| Realtime badge stuck on Polling | `GET /v1/runtime-config` → `realtime_base_url`; WSS ingress |
| Tasks stuck PENDING | Redis URL, executor pods, `ML_AIR_SA_EXECUTOR_SECRET` |
| Strict pin rejected | [Production strict lifecycle](./production-strict-lifecycle.md) |

## Related

- [Configuration](../configuration.md)
- [Production strict lifecycle](./production-strict-lifecycle.md)
- [Production WSS and ingress](./production-wss-ingress.md)
- [Disaster recovery](../troubleshooting/disaster-recovery.md)
- [Helm chart README](../../charts/ml-air/README.md)

## Done

MLAir is deployed from pinned images with verified health and optional strict lifecycle sign-off.
