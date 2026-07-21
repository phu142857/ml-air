# MLAir Backup and Restore Runbook

## Scope

- Metadata: PostgreSQL (`runs`, `tasks`, future control-plane tables)
- Runtime queue/log cache: Redis (best-effort, optional snapshot)
- Artifacts: MinIO bucket data

## RPO / RTO Targets (Baseline)

- Target RPO: 15 minutes
- Target RTO: 60 minutes

## Backup Plan

### PostgreSQL

- Full dump every 15 minutes (or at minimum hourly in dev/staging)
- Keep last 7 days hot + 30 days cold archive

Example command:

```bash
docker exec ml-air-postgres pg_dump -U mlair -d mlair -Fc > backups/postgres/mlair_$(date +%Y%m%d_%H%M%S).dump
```

or via Makefile:

```bash
make backup-db
```

### MinIO

- Mirror artifact bucket to backup location
- Enable object versioning where available

Example command:

```bash
mc mirror --overwrite local/mlair-artifacts backup/mlair-artifacts
```

### Redis (Optional)

- Persist `appendonly yes` for recovery help
- Snapshot every 15 minutes if queue recovery is required

## Restore Procedure

### 1) Freeze writes

- Stop API/scheduler/executor traffic before restore window.

### 2) Restore PostgreSQL

```bash
docker exec -i ml-air-postgres pg_restore -U mlair -d mlair --clean --if-exists < backups/postgres/<file>.dump
```

or via Makefile:

```bash
make restore-db BACKUP_FILE=backups/postgres/<file>.dump
```

### 3) Restore MinIO artifacts

```bash
mc mirror --overwrite backup/mlair-artifacts local/mlair-artifacts
```

### 4) Bring services up

```bash
docker compose -f deploy/docker-compose.quickstart.yml up -d api scheduler executor frontend
```

### 5) Validation checklist

- `curl http://localhost:8080/health` returns `ok`
- Recent runs can be listed and opened
- At least one run can be triggered successfully
- Artifact links/paths resolve for restored runs

## Failure and Rollback

- If restore validation fails, roll back to previous snapshot.
- Record incident with restored snapshot ID, timestamps, and service health.
