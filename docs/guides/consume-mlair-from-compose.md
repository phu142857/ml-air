# Consume MLAir from Compose (decoupled)

## Goal

Run MLAir next to your application stack **without** git-submoduling this repository into your product repo or bind-mounting MLAir source code from another tree.

## Recommended pattern

1. **Pin images by digest or SemVer tag** from your registry (for example `ghcr.io/<org>/ml-air-api:v0.4.0`). Build tags via this repo’s `publish-images` workflow or your own CI.
2. **Keep configuration in your compose or Helm values** only:
   - `ML_AIR_DATABASE_URL`, `ML_AIR_REDIS_URL`, secrets, ports
   - **`ML_AIR_DOCKER_IMAGE`** — auto-wired from your pinned API image ref (see [Run environment capture](./run-environment.md))
   - **`NEXT_PUBLIC_API_BASE_URL`** for the frontend image must match what browsers use to reach the API (set at **image build time**, not only container env).
   - Optional: **`MLAIR_MODEL_PROMOTE_*`** on the API if you notify an external executor on promote.
3. **Do not** mount `./ml-air` from a monorepo sibling into MLAir containers. Treat MLAir as a **dependency service**, like Postgres or Redis.

## MLAir → downstream (webhook and secrets)

Use **Docker network DNS** (or Kubernetes service DNS) so the API container can reach your HTTP receiver by **stable service name**. The Bearer MLAir sends must match what your downstream validates.

| MLAir setting | Points to | Notes |
|---------------|------------|--------|
| `MLAIR_MODEL_PROMOTE_WEBHOOK_URL` | Full URL of **your** HTTP service | Example shape only: `http://<serving-service>:8080/internal/mlair/model-active` — replace service name, port, and path. |
| `MLAIR_MODEL_PROMOTE_WEBHOOK_BEARER_TOKEN` | Shared secret | Same value your downstream checks after `Bearer `. |

Details: [Downstream model promote webhook](./downstream-model-promote-webhook.md).

## Example compose sketch (reference only)

```yaml
services:
  mlair-api:
    image: ghcr.io/your-org/ml-air-api:v0.4.0
    environment:
      ML_AIR_REDIS_URL: redis://mlair-redis:6379/0
      ML_AIR_DATABASE_URL: postgresql://mlair:mlair@mlair-postgres:5432/mlair
      # ... other MLAir env from .env.example in *this* repo

  mlair-frontend:
    image: ghcr.io/your-org/ml-air-frontend:v0.4.0
    ports:
      - "38080:3000"
```

Your **application** services talk to MLAir over HTTP (`/v1/...`) using URLs appropriate to your network (cluster DNS, ingress, or localhost port mapping).

## Cross-repo workflow

- Track **image tag + changelog** for MLAir upgrades (`CHANGELOG.md` in this repo).
- Run your integration tests against a pinned tag before moving `latest` in non-dev environments.

## Done

MLAir is consumed as **published artifacts** (images + documented env), not as a source subtree inside another repository.
