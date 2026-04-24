# ML-AIR Quickstart

## Start all services

```bash
docker compose -f deploy/docker-compose.quickstart.yml up -d --build
```

## Check API health

```bash
curl http://localhost:8080/health
```

## Call a sample v1 endpoint

```bash
curl "http://localhost:8080/v1/tenants/default/projects?limit=10"
```

## Trigger a run (API -> scheduler -> executor)

```bash
curl -X POST "http://localhost:8080/v1/tenants/default/projects/default_project/runs" \
  -H "Content-Type: application/json" \
  -d '{"pipeline_id":"demo_pipeline","idempotency_key":"demo-001"}'
```

## Watch scheduler/executor logs

```bash
docker compose -f deploy/docker-compose.quickstart.yml logs -f scheduler executor
```

## Read run and task status

```bash
curl "http://localhost:8080/v1/tenants/default/projects/default_project/runs/<run_id>"
curl "http://localhost:8080/v1/tenants/default/projects/default_project/runs/<run_id>/tasks"
```

## Stop services

```bash
docker compose -f deploy/docker-compose.quickstart.yml down
```
