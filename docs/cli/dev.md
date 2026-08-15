# MLAir CLI — development utilities

## Goal

Day-to-day local development with the public `mlair` CLI. For CI and verification, use **Makefile** targets (`make test-all`, `make verify-deployment-signoff`, …).

## Stack lifecycle

```bash
mlair doctor
mlair build
mlair start
mlair health
mlair stop
mlair rebuild
```

## API-only development

Run FastAPI with uvicorn (PostgreSQL/Redis must match `.env`):

```bash
mlair serve
mlair serve --reload --port 8080
```

## Compose helpers

```bash
mlair dev ps
mlair dev logs
mlair dev logs mlair
mlair dev shell
```

## Demo data

```bash
mlair seed
mlair seed all
mlair remove demo
```

## Done

Continue with [Quickstart](../getting-started/quickstart.md) and [CLI commands](./commands.md).
