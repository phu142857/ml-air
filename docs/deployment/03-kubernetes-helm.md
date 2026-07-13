# Kubernetes and Helm

**Document ID:** `docs/deployment/03-kubernetes-helm.md`  
**Series:** 005 Deployment Architecture  
**Status:** Frozen v1.0

---

## Purpose

Document the **baseline Helm chart** shipped in-repo. This is a staging-oriented starting point—not a production-hardened platform chart.

**Code:** `charts/ml-air/`, `make test-helm`, `.github/workflows/deploy-helm-staging.yml`

---

## Chart layout

```text
charts/ml-air/
  Chart.yaml
  values.yaml              # defaults
  values-staging.yaml      # staging overrides
  values-staging-strict.yaml
  values-production.yaml   # External Secrets + WSS + ingress TLS
  templates/
    api.yaml, scheduler.yaml, executor.yaml, frontend.yaml, realtime.yaml
```

---

## Workloads

| Resource | Default replicas | Notes |
|----------|------------------|-------|
| API | 1 | ClusterIP :8080 |
| Scheduler | 1 | Scale for HA; enable tick lock (Execution Wave 1) |
| Executor | 1 | Scale for internal mode |
| Realtime | 1 | ClusterIP :8001; metrics :9104 |
| Frontend | 1 | ClusterIP :80 |
| Redis | 1 | Queues + tick locks |
| Postgres | 1 | PVC default 5Gi |
| Minio | 1 | Object storage for artifacts |

**Realtime** ships in chart (`templates/realtime.yaml`). Ingress routes `/ws` and `/healthz` when enabled.

Install with strict lifecycle overlay:

```bash
helm upgrade --install ml-air ./charts/ml-air \
  -f charts/ml-air/values-staging.yaml \
  -f charts/ml-air/values-staging-strict.yaml
```

---

## Secrets (L3)

API JWT material via chart Secret or:

| Pattern | Template |
|---------|----------|
| Chart-managed | `api-secret.yaml` |
| Existing secret | `values.api.secret.existingSecretName` |
| External Secrets | `api-external-secret.yaml` |
| Sealed Secrets | `api-sealed-secret.yaml` |

Align with [config/06-secret-management.md](../config/06-secret-management.md). Do not commit production secrets to values files.

---

## Values → env mapping

Key API env from `values.yaml`:

| Values path | Env |
|-------------|-----|
| `api.env.redisUrl` | `ML_AIR_REDIS_URL` |
| `api.env.databaseUrl` | `ML_AIR_DATABASE_URL` |
| `api.env.runtimeRealtimeBaseUrl` | `ML_AIR_RUNTIME_REALTIME_BASE_URL` (WSS in prod) |
| `api.secret` | `ML_AIR_JWT_HS256_SECRET` |
| Chart defaults | `ML_AIR_TASK_EXECUTION_MODE` |

Staging: `values-staging.yaml` sets ingress host, `existingSecretName`, image repos.

Production: `values-production.yaml` enables External Secrets, ingress TLS, and explicit `wss://…/ws` realtime URL.

Strict lifecycle: merge `deploy/env/staging-strict.env.example` into API/scheduler env (operator extension — see [production-strict-lifecycle](../runbooks/production-strict-lifecycle.md)).

---

## Install (sketch)

```bash
helm upgrade --install ml-air ./charts/ml-air -f charts/ml-air/values-staging.yaml
```

Pin `image.tag` to registry digest or SemVer — never mount repo source into cluster.

---

## CI validation

```bash
make test-helm    # helm lint + template + check_deploy_config.py
```

Workflow `deploy-helm-staging` dispatches on `workflow_dispatch` or version tags `v*.*.*` (requires `KUBE_CONFIG_DATA` secret).

---

## Non-goals (v1.0)

- Production-grade Postgres operator / HA
- Helm-managed external workers (GPU nodes)
- Service mesh / mTLS spec
