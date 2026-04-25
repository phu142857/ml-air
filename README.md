# ML-AIR

ML-AIR is a multi-tenant MLOps control plane (MLflow + ML-UI style) for orchestrating pipelines, model lifecycle, approval gates, and serving routes.

## Documents

- `ARCHITECTURE.md`: target enterprise architecture.
- `openapi-v1-draft.yaml`: API contract draft for v1.
- `ROADMAP.md`: implementation milestones (30/60/90 days).
- `docs/quickstart.md`: local quickstart commands.
- `docs/operations-backup-restore.md`: backup/restore runbook.
- `docs/operations-disaster-recovery-checklist.md`: DR activation checklist.
- `docs/operations-slo-sla-incident-runbook.md`: SLO/SLA and incident handling guide.
- `docs/operations-manifest-security-runbook.md`: manifest/replay security incident playbook.
- `docs/plugin-development-guide.md`: plugin contract and packaging guide.
- `sdk/`: lightweight client helpers (`log_param`, `log_metric`, `log_artifact`) for plugin/runtime tracking.

## Repository Skeleton

- `frontend/`: Next.js ML UI control plane.
- `api/`: FastAPI control-plane API (`/v1/...`).
- `scheduler/`: DAG scheduler service.
- `executor/`: task runner/worker service.
- `sdk/`: plugin and integration contracts.
- `deploy/`: Docker Compose and deployment assets.
- `charts/`: Helm chart for Kubernetes baseline deploy.
- `docs/`: operating docs and guides.

## Design Principles

- API-first and contract-driven.
- Multi-tenant isolation by default (`tenant/project` scoping).
- Approval gate before production routing.
- Slot/alias-based deployment (`candidate/challenger/champion/canary`).
- Observability and audit built in from day one.

## Quickstart

```bash
cp .env.example .env
docker compose -f deploy/docker-compose.quickstart.yml up -d --build
open http://localhost:38080
curl http://localhost:8080/health
curl "http://localhost:8080/v1/tenants/default/projects?limit=10"
curl -X POST "http://localhost:8080/v1/tenants/default/projects/default_project/runs" \
  -H "Content-Type: application/json" \
  -d '{"pipeline_id":"demo_pipeline","idempotency_key":"demo-001"}'
```

## CI/CD

- CI workflow: `.github/workflows/ci.yml`
  - Python syntax check
  - Helm lint + template render
  - Docker build check for `api/scheduler/executor/frontend`
- Image publish workflow: `.github/workflows/publish-images.yml`
  - Trigger by tag `v*.*.*` or manual dispatch
  - Push images to `ghcr.io/<owner>/ml-air-<service>`
- Helm deploy workflow (staging): `.github/workflows/deploy-helm-staging.yml`
  - Trigger by tag `v*.*.*` or manual dispatch
  - Deploy chart `charts/ml-air` to namespace `ml-air-staging`
  - Auto rollback on deploy failure

## Environment Sync Policy

- Every time a new environment variable is introduced in code/compose/scripts, update both `.env` and `.env.example` in the same change.
- Keep `.env` for local runtime values and `.env.example` as the documented template.
- Guard command: `make test-env-sync` (also enforced in CI).

### Required CI/CD secrets

- `KUBE_CONFIG_DATA`: base64 kubeconfig for staging cluster
- `ML_AIR_JWT_HS256_SECRET`: runtime JWT secret for staging API
