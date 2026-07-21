# MLAir CLI (local development)

## Goal

Start and stop the local MLAir stack with the unified CLI.

## Steps

1. Install: `pip install -e .` from repository root.
2. Run preflight: `mlair doctor`
3. Start stack: `mlair rebuild` (or `mlair build` then `mlair start`)

## Command

```bash
mlair doctor
mlair build           # images only
mlair start           # from existing images
mlair rebuild         # build then (re)start
mlair health
mlair stop
python -m mlair rebuild
```

## Result

- MLAir: `http://localhost:8080` (Hub + API + realtime)
- Health: `mlair health`

## Done

Continue with [Quickstart](../getting-started/quickstart.md).
