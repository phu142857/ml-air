# Profiles (L2)

**Document ID:** `docs/config/05-profiles.md`  
**Series:** 002 Platform Configuration Architecture  
**Status:** Frozen v1.0

---

## Principle

**One deployment-mode variable is enough for most users:**

```bash
MLAIR_PROFILE=development   # default
MLAIR_PROFILE=staging
MLAIR_PROFILE=production
```

Profiles select **bundles**—not individual tuning keys. Analogous to:

- MLflow: you pick backend + artifact root; server defaults the rest
- Airflow: you pick executor class; cfg defaults intervals
- Argo: controller ships with defaults; few edit ConfigMap

---

## Bundled profiles

Shipped in `mlair/profiles/` (also in the `mlair` wheel):

| Profile | Intent | Typical bundle |
|---------|--------|----------------|
| `development` | Local all-in-one; fast iteration | strict dataset on; promote approval skipped; OTEL on; legacy cutover flags allowed internally |
| `staging` | Pre-prod sign-off | strict on; promote approval enforced; OTEL on |
| `production` | Lifecycle OS | strict on; approval enforced; OTEL on; no legacy auth |
| `microservices` | Legacy multi-container compose | relaxed strict flags for transitional testing |

---

## What profiles set

Profiles map to **seed values** for L4 and **overrides** for L1 where necessary—implemented via the config loader, not 50 env vars.

| Bundle | Profile controls |
|--------|------------------|
| Strictness | dataset version required, implicit head warnings |
| Governance | skip approval for promote (dev only) |
| Observability | OTEL enabled |
| Execution | internal vs external task mode |
| Readiness | legacy fallback allowed (dev only) |

Profiles do **not** set: database passwords, JWT secrets, artifact credentials.

---

## `mlair.yaml`

Optional file; **thin** overrides only:

```yaml
profile: staging
compose:
  file: deploy/docker-compose.allinone.yml
ports:
  hub: 8080
```

Users should not copy a hundred keys from `.env.example` into `mlair.yaml`.

---

## CLI

```bash
mlair start                          # profile development
mlair start --profile production
MLAIR_PROFILE=staging mlair start
mlair config print                   # merged view for debugging
```

---

## Relation to L3

`MLAIR_PROFILE` in `.env` (group D) selects the bundle. Secrets and URLs remain in groups A–C.
