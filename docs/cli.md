# ML-AIR CLI (Alpha)

Minimal developer CLI for Day 4 Gate 2 prep.

## Setup

Run from repo root:

```bash
chmod +x ./mlair
```

## Environment

CLI reads these env vars (with defaults):

- `ML_AIR_BASE_URL` (default `http://localhost:8080`)
- `ML_AIR_TENANT_ID` (default `default`)
- `ML_AIR_PROJECT_ID` (default `default_project`)
- `ML_AIR_TOKEN` (default `maintainer-token`)

## Commands

### Start local stack

```bash
./mlair dev up
```

### Trigger run from config file

```bash
./mlair run examples/pipeline.demo.yaml
```

### Read run logs

```bash
./mlair logs <run_id> --limit 50
```

## Notes

- YAML parsing needs `PyYAML` when file is not valid JSON format.
- CLI returns exit code `0` on success, `1` on failure.
