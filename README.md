# ML-AIR

ML-AIR is a multi-tenant MLOps control plane (MLflow + ML-UI style) for orchestrating pipelines, model lifecycle, approval gates, and serving routes.

## Documents

- `ARCHITECTURE.md`: target enterprise architecture.
- `openapi-v1-draft.yaml`: API contract draft for v1.
- `ROADMAP.md`: implementation milestones (30/60/90 days).
- `docs/quickstart.md`: local quickstart commands.

## Repository Skeleton

- `frontend/`: Next.js ML UI control plane.
- `api/`: FastAPI control-plane API (`/v1/...`).
- `scheduler/`: DAG scheduler service.
- `executor/`: task runner/worker service.
- `sdk/`: plugin and integration contracts.
- `deploy/`: Docker Compose and deployment assets.
- `docs/`: operating docs and guides.

## Design Principles

- API-first and contract-driven.
- Multi-tenant isolation by default (`tenant/project` scoping).
- Approval gate before production routing.
- Slot/alias-based deployment (`candidate/challenger/champion/canary`).
- Observability and audit built in from day one.

## Quickstart

```bash
docker compose -f deploy/docker-compose.quickstart.yml up -d --build
curl http://localhost:8080/health
curl "http://localhost:8080/v1/tenants/default/projects?limit=10"
curl -X POST "http://localhost:8080/v1/tenants/default/projects/default_project/runs" \
  -H "Content-Type: application/json" \
  -d '{"pipeline_id":"demo_pipeline","idempotency_key":"demo-001"}'
```
