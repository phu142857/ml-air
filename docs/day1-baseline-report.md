# Day 1 Baseline Report (Clone -> Up -> Health)

Date: 2026-04-25

## Scope

- Preflight checks (`make doctor`)
- One-command bootstrap (`make up`)
- Stack health validation (`make health`)

## Result Snapshot

- `make doctor`: PASS (with warning when ports are occupied)
- `make up`: FAIL on this machine because host port `5432` was already in use
- `make health`: blocked when stack did not fully start

## Mitigation Applied

- Updated `.env.example` defaults to avoid common local conflicts:
  - `ML_AIR_REDIS_PORT=36379`
  - `ML_AIR_POSTGRES_PORT=35432`

This keeps container-internal URLs unchanged while reducing first-run friction on developer machines.

## Timing Notes

- Partial run (`make up` before failure): ~160s until conflict surfaced.
- Next validation run should be executed from a clean machine (or after freeing occupied ports) using:

```bash
cp .env.example .env
make fresh-machine-test
```

The command prints elapsed seconds in JSON-style output for tracking against Gate 1.
