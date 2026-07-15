# Login and Identity (Hub operators)

## Goal

Sign in to the Hub, obtain API access for curl/scripts, and manage users and service accounts as Global Admin.

MLAir uses **login-first** human identity. Static `viewer-token` / `maintainer-token` paste is **legacy dual-run only** when `ML_AIR_LEGACY_STATIC_TOKENS=1`.

Deployment secrets: [Configuration](../configuration.md).

## Steps

1. Start the stack (`mlair rebuild` or `mlair start`).
2. Run database migrations (included in container startup on all-in-one; for microservices: `alembic upgrade head` in API).
3. Sign in at Hub **`/login`**.
4. Use **Settings** or API with the access token for automation.

## First login (bootstrap Global Admin)

On first startup with an empty `users` table, the API seeds one Global Admin from env (see `.env.example`):

| Variable | Dev default |
|----------|-------------|
| `ML_AIR_BOOTSTRAP_ADMIN_USERNAME` | `admin` |
| `ML_AIR_BOOTSTRAP_ADMIN_PASSWORD` | `admin-change-me` |

1. Open `http://localhost:8080/login` (or your `MLAIR_PORT`).
2. Sign in with the bootstrap username and password.
3. Change the password via **Admin → Users** (or API `PATCH /v1/users/{id}`).

Platform automation (scheduler, executor, external workers) uses **Service Account** secrets (`ML_AIR_SA_*_SECRET`), not the human admin password.

## Hub after login

| Area | Path | Who |
|------|------|-----|
| Lifecycle, datasets, models | Sidebar | Any authenticated user with scope |
| Execution (pipelines, runs, tasks) | Sidebar | Maintainer+ in pinned scope |
| **Admin → Users** | `/admin/users` | Global Admin or tenant admin |
| **Admin → Service accounts** | `/admin/service-accounts` | Global Admin |
| **Admin → Audit** | `/admin/audit` | Global Admin |
| Settings (session, scope) | `/settings` | Signed-in user |

Unauthenticated users are redirected to `/login` when identity login is enabled (default).

## API login (curl / CI)

```bash
API="${ML_AIR_BASE_URL:-http://localhost:8080}"
curl -sS -X POST "$API/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"${ML_AIR_BOOTSTRAP_ADMIN_USERNAME:-admin}\",\"password\":\"${ML_AIR_BOOTSTRAP_ADMIN_PASSWORD:-admin-change-me}\"}"
```

Response includes `access_token` and `refresh_token`. Use:

```bash
export TOKEN="<access_token>"
curl -sS -H "Authorization: Bearer $TOKEN" "$API/v1/auth/me"
```

Refresh:

```bash
curl -sS -X POST "$API/v1/auth/refresh" \
  -H "Content-Type: application/json" \
  -d "{\"refresh_token\":\"<refresh_token>\"}"
```

Smoke scripts use the same flow when legacy static tokens are off: `scripts/identity_smoke_token.py`.

## Service accounts (machines)

Workers, scheduler, and executor authenticate with **Service Account** bearer secrets—not human passwords.

| SA (bootstrap name) | Typical env secret |
|---------------------|-------------------|
| `mlair-scheduler` | `ML_AIR_SA_SCHEDULER_SECRET` |
| `mlair-executor` | `ML_AIR_SA_EXECUTOR_SECRET` |

**External workers** are not bootstrapped by MLAir. Create a Service Account in **Identity → Service accounts**, grant worker permissions (`tasks:lease`, `logs:write`, etc.), issue a secret, and configure your worker with `ML_AIR_SERVICE_ACCOUNT_TOKEN` or `ML_AIR_SA_WORKER_SECRET`. See [External worker execution](./external-worker-execution.md).

## Legacy static tokens (dual-run)

If `ML_AIR_LEGACY_STATIC_TOKENS=1`, the API still accepts `viewer-token`, `maintainer-token`, and `admin-token` for migration. **Do not use in production.** Hub **Settings → Session bearer** paste exists only for this transition.

## Result

- You can use the Hub without pasting static tokens.
- curl and `make smoke-quickstart` work with identity login when legacy is off.

## Done

- [Configure tenant and project scope](./configure-tenant-project-scope.md)
- [OpenTelemetry and Trace explorer](./opentelemetry.md)
- API reference: [API Overview](../api/overview.md)
