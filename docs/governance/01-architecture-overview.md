# Governance Architecture Overview

**Document ID:** `docs/governance/01-architecture-overview.md`  
**Series:** 004 Governance Architecture  
**Status:** Frozen v1.0

---

## Layers

```text
L4  system_settings     Platform defaults (Global Admin, Hub System tab)
L5  tenant_quotas       Per-tenant capacity + webhook host subset
L3  secrets             Manifest signing keys, SA secrets (never in L4/L5 tables)
L1  worker tuning       Tick intervals, lease seconds, realtime coalesce (code defaults)
```

Package **002** owns layer rules; Package **004** owns cross-domain semantics.

---

## Policy resolution (workers)

Scheduler, executor, and realtime read **feature / replay / OTel** flags through `app.settings.worker` when `api` is on `PYTHONPATH` (all-in-one and microservice images). L3 connection strings and L1 tuning remain environment variables.

---

## Hub surfaces

| Surface | Audience | Writes |
|---------|----------|--------|
| Settings → **System** | Global Admin | L4 `PATCH /v1/system/settings` |
| Settings → **Governance** | Tenant admin | L5 `PUT /v1/tenants/{id}/quotas` |
| Model lifecycle | Maintainer+ | Promotion APIs (policy from L4) |

---

## Related

- [02-promotion-and-approval.md](./02-promotion-and-approval.md)
- [03-manifest-and-lineage.md](./03-manifest-and-lineage.md)
- [04-dataset-policy.md](./04-dataset-policy.md)
- [05-audit-model.md](./05-audit-model.md)
- [config/04-tenant-runtime-settings.md](../config/04-tenant-runtime-settings.md)
- [config/03-system-runtime-settings.md](../config/03-system-runtime-settings.md)
- [api/tenant-quotas.md](../api/tenant-quotas.md)
