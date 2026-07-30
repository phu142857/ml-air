# Login and Identity (Hub operators)

## Goal

Sign in to the Hub, secure your account, obtain API access (PATs or login tokens), and administer users/service accounts when you are an admin.

MLAir uses **login-first** human identity. Static `viewer-token` / `maintainer-token` paste is **legacy dual-run only** when `ML_AIR_LEGACY_STATIC_TOKENS=1`.

Deployment secrets: [Configuration](../configuration.md).

## Steps

1. Start the stack (`mlair rebuild` or `mlair start`).
2. Run database migrations (included in container startup on all-in-one; for microservices: `alembic upgrade head` in API).
3. Sign in at Hub **`/login`**.
4. Use **My Account** settings or API tokens for day-to-day work.

## First login (bootstrap Global Admin)

On first startup with an empty `users` table, the API seeds one Global Admin from env (see `.env.example`):

| Variable | Dev default |
|----------|-------------|
| `ML_AIR_BOOTSTRAP_ADMIN_USERNAME` | `admin` |
| `ML_AIR_BOOTSTRAP_ADMIN_PASSWORD` | `admin-change-me` |

1. Open `http://localhost:8080/login` (or your `MLAIR_PORT`).
2. Sign in with the bootstrap username and password.
3. Change the password at **My Account → Security** (`/settings/security`), or via API `POST /v1/auth/change-password`.
4. (Recommended) Enable MFA — [MFA and recovery codes](./mfa-and-recovery-codes.md).

Platform automation (scheduler, executor, external workers) uses **Service Account** secrets (`ML_AIR_SA_*_SECRET`), not the human admin password.

## Hub navigation after login

### Product (sidebar)

| Area | Path | Who |
|------|------|-----|
| Lifecycle (datasets, models, lineage, traces) | Sidebar | Any authenticated user with scope |
| Overview (dashboard, search) | Sidebar | Any authenticated user with scope |
| Execution (pipelines, runs, tasks) | Sidebar | Maintainer+ in pinned scope |

### My Account

Open via topbar **avatar → Profile**, or go directly:

| Area | Path | Purpose |
|------|------|---------|
| Profile | `/settings/profile` | Display name, email, metadata |
| Security | `/settings/security` | Password, MFA, recovery codes |
| Sessions | `/settings/sessions` | List/revoke your browser sessions |
| CLI & API | `/settings/cli` | Personal Access Tokens (PATs) |
| Preferences | `/settings/preferences` | Appearance and workspace defaults |
| About | `/settings/about` | Product / deployment metadata |

**Sign out:** topbar avatar menu → **Sign out**.

### Administration (gated)

Shown when you have admin scope (Identity) and/or Global Admin (Platform):

| Area | Path | Who |
|------|------|-----|
| Audit Logs | `/identity/dashboard` | Admin |
| Users | `/identity/users` | Admin |
| Service Accounts | `/identity/service-accounts` | Admin |
| Org sessions | `/identity/sessions` | Admin |
| Authentication Policy | `/identity/settings` | Global Admin |
| Platform General / Runtime / Integrations / Observability | `/identity/platform/*` | Global Admin |

Legacy URLs such as `/admin/users` and `/settings/admin/*` redirect into the routes above.

Unauthenticated users are redirected to `/login` when identity login is enabled (default).

## API login (curl / CI)

```bash
API="${ML_AIR_BASE_URL:-http://localhost:8080}"
curl -sS -X POST "$API/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"${ML_AIR_BOOTSTRAP_ADMIN_USERNAME:-admin}\",\"password\":\"${ML_AIR_BOOTSTRAP_ADMIN_PASSWORD:-admin-change-me}\"}"
```

### Without MFA

Response includes `access_token`, `refresh_token`, and `user`. Use:

```bash
export TOKEN="<access_token>"
curl -sS -H "Authorization: Bearer $TOKEN" "$API/v1/auth/me"
```

### With MFA enabled

Login returns `mfa_required: true` and a short-lived `challenge_token` (no access token yet). Complete with:

```bash
curl -sS -X POST "$API/v1/auth/mfa/verify" \
  -H "Content-Type: application/json" \
  -d "{\"challenge_token\":\"<challenge_token>\",\"otp_code\":\"123456\"}"
```

Or use a recovery code (`recovery_code`) instead of `otp_code`. See [MFA and recovery codes](./mfa-and-recovery-codes.md).

### Refresh

```bash
curl -sS -X POST "$API/v1/auth/refresh" \
  -H "Content-Type: application/json" \
  -d "{\"refresh_token\":\"<refresh_token>\"}"
```

Smoke scripts use the same flow when legacy static tokens are off: `scripts/identity_smoke_token.py`.

For long-lived automation as a **human** user, prefer a PAT — [Personal Access Tokens](./personal-access-tokens.md). Machines should use service accounts.

## Service accounts (machines)

Workers, scheduler, and executor authenticate with **Service Account** bearer secrets—not human passwords.

| SA (bootstrap name) | Typical env secret |
|---------------------|-------------------|
| `mlair-scheduler` | `ML_AIR_SA_SCHEDULER_SECRET` |
| `mlair-executor` | `ML_AIR_SA_EXECUTOR_SECRET` |

**External workers** are not bootstrapped by MLAir. Create a Service Account in **Administration → Identity → Service accounts**, grant worker permissions (`tasks:lease`, `logs:write`, etc.), issue a secret, and configure your worker with `ML_AIR_SERVICE_ACCOUNT_TOKEN` or `ML_AIR_SA_WORKER_SECRET`. See [External worker execution](./external-worker-execution.md).

## Legacy static tokens (dual-run)

If `ML_AIR_LEGACY_STATIC_TOKENS=1`, the API still accepts `viewer-token`, `maintainer-token`, and `admin-token` for migration. **Do not use in production.** Prefer login tokens or PATs.

## Related guides

- [MFA and recovery codes](./mfa-and-recovery-codes.md)
- [Personal Access Tokens (CLI & API)](./personal-access-tokens.md)
- [Manage sessions](./manage-sessions.md)
- [Configure tenant and project scope](./configure-tenant-project-scope.md)

## Result

- You can use the Hub without pasting static tokens.
- Account security (password, MFA, sessions, PATs) is self-service under **My Account**.
- curl and `make smoke-quickstart` work with identity login when legacy is off.

## Done

- [OpenTelemetry and Trace explorer](./opentelemetry.md)
- API reference: [API Overview](../api/overview.md)
