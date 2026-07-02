# `mlair serve` (formerly `mlair dev up`)

## Goal

Start the local MLAir microservice stack with one command.

## Steps

1. Install package: `pip install -e .`
2. Run preflight: `mlair doctor`
3. Start stack: `mlair serve`

## Command

```bash
mlair serve
mlair serve --build
mlair dev up          # alias
python -m mlair serve
```

## Result

Docker Compose starts API, scheduler, executor, realtime, Hub, Postgres, and Redis.

## Done

See [Configuration](../configuration.md) and [Quickstart](../getting-started/quickstart.md).
