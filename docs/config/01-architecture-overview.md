# Platform Configuration — Architecture Overview

**Document ID:** `docs/config/01-architecture-overview.md`  
**Series:** 002 Platform Configuration Architecture  
**Status:** Frozen v1.0  
**Canonical index:** this document

---

## Problem statement

MLAir’s `.env.example` has grown to **~190 variables**, mixing:

- Docker Compose host ports and image tags
- Secrets and signing keys
- Feature flags and product policy
- Scheduler/worker tuning and Redis stream limits
- CLI dev helpers and CI-only switches

This contradicts the product goal: **install and run** with minimal operator input (MLflow, Argo, Docker Compose patterns), while production can override **secrets** and **deployment class** without reading a hundred-line env file.

---

## Target operator experience

| Persona | Configures | Does not configure |
|---------|------------|-------------------|
| **Developer** | Nothing (default profile) | Lease seconds, stream maxlen, retry backoff |
| **Platform admin** | Hub **System Settings**, secrets rotation | Per-key env in `.env` |
| **Tenant admin** | Hub / APIs (quota, webhooks, promotion) | Global scheduler intervals |
| **SRE** | Profile class, image pin, infra URLs | Feature flags in env |

---

## Layer model (summary)

See [02-configuration-layers.md](./02-configuration-layers.md) for full rules.

```text
L0  Constants              API paths, issuer names, catalogs
L1  Internal defaults      Code defaults (lease, retry, OTEL names)
L2  Profile                development | staging | production bundles
L3  Deployment contract    ~20 env vars (infra, secrets, profile, image)
L4  System runtime         Global Hub Settings (retention, defaults, telemetry)
L5  Tenant runtime         Per-tenant policy (quota, webhooks, promotion)
```

**Critical split:** L4 (system) and L5 (tenant) are both “runtime” but **must not share one bucket**—same distinction as Kubernetes cluster config vs namespace policy.

---

## What is not configuration

| Item | Layer | Rationale |
|------|-------|-----------|
| Human login / Identity JWT | Platform core (L0/L1 + L3 secrets) | Cannot be toggled like “Dataset Hub V2” |
| Role assignments, SA scopes | L5 (IAM APIs) | Already in Package 001 |
| Task lease / retry state machine | Package 003 Execution | Not env |
| Manifest signing verification rules | Package 004 Governance | Policy, not deploy env |

---

## Document map

| Doc | Topic |
|-----|--------|
| [02-configuration-layers.md](./02-configuration-layers.md) | L0–L5 rules and examples |
| [03-system-runtime-settings.md](./03-system-runtime-settings.md) | L4 schema and Hub System Settings |
| [04-tenant-runtime-settings.md](./04-tenant-runtime-settings.md) | L5 and link to IAM tenant policy |
| [05-profiles.md](./05-profiles.md) | Profile bundles; thin `mlair.yaml` |
| [06-secret-management.md](./06-secret-management.md) | L3 secrets, rotation, compose vs K8s |
| [07-deployment-contract.md](./07-deployment-contract.md) | `.env` groups A–E (~20 vars) |
| [08-contributor-rules.md](./08-contributor-rules.md) | PR gates |
| [09-migration-strategy.md](./09-migration-strategy.md) | From as-is env sprawl |

**ADRs:** [011](../adr/011-platform-configuration-philosophy.md), [012](../adr/012-system-runtime-settings.md), [013](../adr/013-deployment-contract-and-secrets.md)

---

## Comparison to peer systems

| System | Narrow deploy input | Structured operator config | Mutable policy |
|--------|---------------------|----------------------------|----------------|
| MLflow | backend URI, artifact root, host, port | minimal | experiments in DB |
| Argo | controller install | ConfigMap (few edit) | WorkflowTemplates |
| Airflow | executor, DB conn | `airflow.cfg` sections | Variables, Connections |
| **MLAir target** | L3 ~20 vars + profile | L2 bundles | L4 Hub + L5 tenant APIs |

---

## Series context

- **001** Identity — closed  
- **002** Configuration — this package  
- **003** Execution — scheduler, executor, lease, replay (planned)  
- **004** Governance — promotion, manifest, lineage (planned)  
- **005** Deployment — Helm, HA, DR (planned)

See [Platform Architecture Series](../architecture/00-platform-architecture-series.md).
