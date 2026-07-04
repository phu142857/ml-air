# Installation

## Goal

Get a running MLAir stack with **one package** and **sensible defaults** — either by
pulling a pre-built image from GitHub, or by building it from a clone. After it is up,
you only configure per this doc.

MLAir ships as a single all-in-one image (Hub + API `/v1` + realtime `/ws` + scheduler +
executor + Postgres, behind an internal nginx on one public port `8080`).

## Path A — Pull the pre-built image (no build)

Published to GitHub Container Registry on every release: `ghcr.io/<owner>/ml-air`.

```bash
git clone <repo-url>          # for the `mlair` CLI, compose file and docs
cd ml-air
pip install -e .

# Point at the published image, pull it, and start:
export MLAIR_IMAGE=ghcr.io/<owner>/ml-air:latest
mlair start --pull
mlair health
```

`mlair start --pull` fetches `MLAIR_IMAGE` from the registry and runs it — no local build.

## Path B — Clone and build

Builds the image from source (also (re)packages the SDK wheel into `dist/`):

```bash
git clone <repo-url>
cd ml-air
pip install -e .
mlair doctor
mlair build      # or: mlair rebuild (build + start)
mlair start
mlair health
```

## Configure

Defaults work out of the box. To override, copy the example env and edit:

```bash
cp .env.example .env
```

Common keys (full list in [Configuration](../configuration.md)):

| Key | Default | Purpose |
|---|---|---|
| `MLAIR_IMAGE` | `ml-air:latest` | Image to run (set to a GHCR ref for Path A) |
| `MLAIR_PORT` | `8080` | Public port for Hub + API + realtime |
| `ML_AIR_TRACKING_TOKEN` | `admin-token` | Bearer token for API / workers |
| `ML_AIR_USAGE_TRACKING_ENABLED` | `1` | CPU/RAM/GPU usage capture |

## Result

- MLAir (Hub + API + realtime): `http://localhost:8080`
- `mlair health` passes.

## Done

Continue with [Quickstart](./quickstart.md).
