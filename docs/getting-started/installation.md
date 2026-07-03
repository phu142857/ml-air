# Installation

## Goal

Install MLAir and prepare a local environment with **one package** and **sensible defaults**.

## Steps

1. Clone the repository.
2. Install the unified `mlair` package (includes SDK).
3. Run preflight and start the stack.

## Command

```bash
git clone <repo-url>
cd ml-air
pip install -e .
mlair doctor
mlair rebuild
mlair health
```

Optional: copy `mlair.yaml.example` → `mlair.yaml` only if you need overrides. See [Configuration](../configuration.md).

## Result

`mlair doctor` passes (warnings OK). `mlair rebuild` builds images and starts the all-in-one stack (API, Hub, scheduler, executor, realtime, Postgres, Redis).

- MLAir (Hub + API + realtime): `http://localhost:8080`

## Done

Continue with [Quickstart](./quickstart.md).
