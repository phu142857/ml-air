# Production strict lifecycle

## Goal

Enable **strict dataset version pinning** and **readiness gating** for staging/production so runs cannot bypass lifecycle rules. Sign off with automated checks before go-live.

Strict mode is required for MLAir as a **Lifecycle OS** — not optional for production teams that enforce dataset immutability.

## What changes in strict mode

| Setting | Strict value | Effect |
|---------|--------------|--------|
| `ML_AIR_STRICT_DATASET_VERSION_REQUIRED` | `1` | Dataset version pin required where policy applies |
| `ML_AIR_STRICT_DATASET_VERSION_ALL_POST_RUNS` | `1` | All `POST .../runs` paths honor pinning |
| `ML_AIR_READINESS_ALLOW_LEGACY_FALLBACK` | `0` | No implicit latest materialized head without `dataset_version_id` |

Hub **runtime-config** exposes the same flags under `features.*` — L4 **system_settings** wins over env when seeded. See [Configuration](../configuration.md#profile--environment-variables).

## Steps

1. Choose overlay: staging sign-off vs production.
2. Merge env or Helm values.
3. Sync L4 system settings (if DB already has `system_settings`).
4. Run verification scripts.
5. Complete operator checklist.

## Path A — Compose / all-in-one

### Staging strict

```bash
cd ml-air
cp .env.example .env
cat deploy/.env.infra.example >> .env
cat deploy/env/staging-strict.env.example >> .env

# Edit secrets, then:
mlair rebuild    # or mlair start after image pull
mlair health
```

`staging-strict.env.example` sets `ML_AIR_WARN_IMPLICIT_DATASET_HEAD=1` so implicit-head callers are logged during M1 sign-off.

### Production strict

```bash
cat deploy/env/production-strict.env.example >> .env
# Or use profile:
mlair start --profile production
```

### Sync L4 features (required when system_settings exists)

Profile/env strict flags are **ignored** once L4 is seeded. Patch Hub System settings:

```bash
export ML_AIR_BASE_URL=http://localhost:8080
python scripts/sync_strict_lifecycle_l4.py
```

Uses Global Admin login from `ML_AIR_BOOTSTRAP_ADMIN_*`.

## Path B — Helm

Merge strict overlay with production values:

```bash
helm upgrade --install ml-air ./charts/ml-air \
  --namespace ml-air-prod \
  -f charts/ml-air/values-production.yaml \
  -f charts/ml-air/values-production-strict.yaml \
  # ... image registry/tag sets from production-deployment runbook
```

`values-production-strict.yaml` sets `api.extraEnv`, `scheduler.extraEnv`, and `realtime.extraEnv` to match `deploy/env/production-strict.env.example`.

## Verification

```bash
export ML_AIR_BASE_URL=https://mlair.staging.example.com

# Static: strict keys present in env examples
python scripts/verify_operator_signoff.py --strict

# Lifecycle behavior against live API
python scripts/verify_strict_lifecycle.py
```

`verify_operator_signoff.py --strict` runs:

1. Strict env file checks
2. `sync_strict_lifecycle_l4.py` (unless `--skip-l4-sync`)
3. `verify_strict_lifecycle.py`
4. Identity + realtime gates (unless skipped)

Skip Wave 0 when stack is remote-only: `SKIP_WAVE0=1 python scripts/verify_operator_signoff.py --strict`

## Operator checklist

### Before enabling strict

- [ ] All pipelines declare dataset inputs (or keep `ML_AIR_REQUIRE_DECLARED_DATASET_INPUTS=0` until migrated).
- [ ] Materialized dataset versions exist for training paths.
- [ ] Readiness policies configured — [Configure data readiness](../guides/configure-data-readiness-gating.md).
- [ ] Integrators updated: no implicit dataset head in `POST /runs` — [Dataset version immutability](../api/dataset-version-immutability.md).

### After enabling strict

- [ ] `GET /v1/runtime-config` shows `features.strict_dataset_version_required: true`.
- [ ] `features.readiness_allow_legacy_fallback: false`.
- [ ] Blocked run shows readiness gate message — [Readiness gate blocked](../troubleshooting/readiness-gate-blocked.md).
- [ ] Audit timeline records gate events.

### Rollback (emergency only)

1. Set `ML_AIR_CONFIG_ACCEPT_POLICY_ENV=1` temporarily (documented rollback flag in [Configuration](../configuration.md)).
2. Restore previous L4 features via Hub System tab or re-run sync with relaxed values.
3. Redeploy previous image tag if behavior regression is code-related.

Do not leave rollback flags enabled in production without a ticket.

## Staging vs production differences

| | Staging strict | Production strict |
|---|----------------|-------------------|
| Profile | `staging` | `production` |
| `ML_AIR_WARN_IMPLICIT_DATASET_HEAD` | `1` (observe) | `0` |
| Promote approval | enforced | enforced |
| Overlay file | `deploy/env/staging-strict.env.example` | `deploy/env/production-strict.env.example` |

## Related

- [Production deployment](./production-deployment.md)
- [Dataset Hub and readiness](../guides/dataset-hub-and-readiness.md)
- [Readiness and Gating API](../api/readiness-and-gating.md)
- [Production maturity](../guides/production-maturity.md)

## Done

Strict lifecycle is active in env, L4, and runtime-config; automated sign-off passes.
