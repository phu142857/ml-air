# Installation

## Goal

Get a running MLAir stack with **one package** and **sensible defaults** — either by
pulling a pre-built image from GitHub, or by building it from a clone. After it is up,
you only configure per this doc.

MLAir ships as a single all-in-one image (Hub + API `/v1` + realtime `/ws` + scheduler +
executor + Postgres, behind an internal nginx on one public port `8080`).

## Path A — Pull the pre-built image (no build)

Published to GitHub Container Registry on every release:

- **All-in-one:** `ghcr.io/phu142857/ml-air:<tag>` (this repo — replace `phu142857/ml-air` with your `owner/repo` on a fork)
- **Microservices:** `ghcr.io/phu142857/ml-air-{api,frontend,scheduler,executor,realtime}:<tag>`

```bash
git clone https://github.com/phu142857/ml-air.git   # CLI, compose, docs
cd ml-air
pip install -e .

# Point at the published image, pull it, and start:
export MLAIR_IMAGE=ghcr.io/phu142857/ml-air:v1.0.0
mlair start --pull
mlair health
```

`mlair start --pull` fetches `MLAIR_IMAGE` from the registry and runs it — no local build.

## Path B — Clone and build

Builds the image from source (also (re)packages the SDK wheel into `dist/`):

```bash
git clone https://github.com/phu142857/ml-air.git
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
| `ML_AIR_BOOTSTRAP_ADMIN_USERNAME` | `admin` | First Global Admin username (empty `users` table) |
| `ML_AIR_BOOTSTRAP_ADMIN_PASSWORD` | `admin-change-me` | Bootstrap admin password — change after first login |
| `ML_AIR_SA_SCHEDULER_SECRET` / `ML_AIR_SA_EXECUTOR_SECRET` | (generated in `.env.example`) | Service account secrets for platform automation |
| `ML_AIR_LEGACY_STATIC_TOKENS` | `0` | `1` only during migration (`viewer-token`, etc.) |
| `ML_AIR_USAGE_TRACKING_ENABLED` | `1` | CPU/RAM/GPU usage capture |

Optional **MinIO / Prometheus / Grafana** sidecars are **off by default**. Enable in `mlair.yaml` (see [Configuration](../configuration.md#optional-infra-sidecars-all-in-one)) or via `MLAIR_INFRA_*` in `deploy/.env.infra.example`.

**Production:** see [Production deployment](../runbooks/production-deployment.md) for pinned images, Helm, and sign-off.

## Result

- MLAir (Hub + API + realtime): `http://localhost:8080`
- `mlair health` passes.
- You can sign in at `/login` and open **Settings** to pin tenant/project scope.
- Grafana `:33000`, Prometheus `:39090`, MinIO console `:9001` — only when `infra` is enabled in config.

## Sign in

After the stack is healthy, open **`http://localhost:8080/login`** and sign in with the bootstrap admin credentials. Hub and API use identity JWTs by default — not pasted static tokens. See [Login and Identity](../guides/login-and-identity.md).

## Done

Continue with [Quickstart](./quickstart.md).
