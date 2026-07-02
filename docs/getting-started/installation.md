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
mlair serve
```

Alternative without pip (from repo root):

```bash
python -m mlair doctor
python -m mlair serve
```

Optional: copy `mlair.yaml.example` → `mlair.yaml` only if you need overrides. See [Configuration](../configuration.md).

## Result

`mlair doctor` passes (warnings OK). `mlair serve` starts API, scheduler, executor, realtime, Hub, Postgres, and Redis via Docker Compose.

- API: `http://localhost:8080`
- MLAir (Hub + API): `http://localhost:8080`

## Done

Continue with [Quickstart](./quickstart.md).

For running MLAir **next to another stack** without vendoring this repo, see [Consume MLAir from Compose (decoupled)](../guides/consume-mlair-from-compose.md).
