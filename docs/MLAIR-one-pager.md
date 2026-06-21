# MLAir — Lifecycle OS (one page)

**Governance-centric lifecycle control plane for ML** — not a scheduler UI product, not “Airflow + MLflow in a box.”

---

## Problem

Teams train on **mutable “latest” data**, scatter **run identity** across DAG tools and experiment trackers, and cannot **audit** who promoted what from which **dataset version**. Glue scripts map `dag_run_id` ↔ external run IDs ↔ Hub — fragile and unreproducible.

---

## MLAir as lifecycle OS

One platform owns the chain:

**dataset version → readiness → eligibility → gated run → model governance**

| Layer | MLAir owns | Execution substrate (internal) |
| --- | --- | --- |
| **Pin** | Immutable `dataset_version_id` (`vN`) | — |
| **Policy** | Readiness + training eligibility | — |
| **Run** | Single Hub **`run_id`**, lineage, usage | Pipeline DAG, scheduler, executor |
| **Model** | Registry, stages, promote/rollback | Plugin adapters |

**Operator UX:** Dataset Hub **Run / Train** first. **Pipelines / Runs** = maintainer observability — we do **not** claim a scheduler UX win vs Airflow.

**Comparison baseline (paper/lab only):** E2 Airflow+MLflow re-runs for benchmarks — **not** how MLAir is deployed. See [case-study-mlair-only-path](./guides/case-study-mlair-only-path.md).

---

## Three proofs (clinic-scoped, MLAir API path)

| Proof | What it shows |
| --- | --- |
| **Vet-AI (clinic integrator)** | Acts 1–3 via **plugin + Hub**: ingest → materialize → readiness → train → one `run_id` |
| **YOLO AWS (`c55adc33`)** | Production-like **lifecycle-train** SUCCESS: pinned version, Hub run detail, lineage + resource usage |
| **E2 metadata / governance** | Version pin, readiness codes, promote policy — reproducible audit trail (not dollar chargeback) |

Resource **usage** is recorded (`task_usage`); **monetary chargeback** is explicitly out of scope / future adapter.

---

## Terminology (use consistently)

- **Dataset readiness** — policy evaluation on a **version**
- **Training eligibility** — readiness + governance
- **Execution gate** — runtime/pipeline checks before tasks run

Details: [readiness-and-gating](./api/readiness-and-gating.md)

---

## Get started

```bash
make up
open http://localhost:38080   # Datasets → Run / Train
```

Docs: [README](../README.md) · [staging/prod sign-off](./runbooks/staging-prod-signoff.md) · [CLI smoke only](./cli/commands.md) (`dev` / `run` / `logs`)

---

## What we do not claim

- Best DAG editor or cron scheduler UX
- Replacement for every MLflow experiment UI feature
- Enterprise “single pane” for all MLOps tools — **lifecycle control plane** for **your** integrators and plugins
