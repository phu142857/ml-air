# Case studies: MLAir-only path vs comparison baseline

## Principle

**MLAir is the operational path.** Paper and lab **E2 (Airflow + MLflow)** workflows exist for **comparison and benchmark**, not as the way operators run Vet-AI or YOLO in production-like environments.

| Path | Role | Operator daily ops? |
| --- | --- | --- |
| **MLAir lifecycle** | Hub + API + plugin: version → readiness → gate → **one `run_id`** → lineage → usage → promote | **Yes** |
| **E2 baseline** | External DAG + external tracking + manual `state.json` / id mapping | **No** — benchmark / ablation only |

Do **not** require operators to map `dag_run_id` ↔ MLflow run ↔ Hub `run_id` for production-like case studies.

---

## Vet-AI (integrator plugin + Hub)

**Direction:** Acts 1–3 through MLAir plugin surfaces and Dataset Hub — **correct architecture**.

| Act | MLAir surfaces | Notes |
| --- | --- | --- |
| Ingest / buffer | Dataset buffer, materialization → **`vN`** | Feedback mirror via lineage ingest ([lineage_service](../../api/app/domains/lifecycle/lineage_service.py)) |
| Readiness | `GET/POST .../readiness`, eligibility | Pin **`dataset_version_id`**; strict env default |
| Train | Hub **Run / Train** or `POST .../runs/trigger` | Same **`run_id`** in Hub Runs, lineage, usage |
| Promote | `POST .../models/{id}/promote` | Governance stages via runtime-config |

**Paper/docs wording:** describe Vet-AI as an **MLAir integrator** (plugin + Hub), not as a separate Airflow deployment story.

**Out of scope for MLAir core runbooks:** Vet-AI app UI/deploy — see integrator repo; MLAir documents **API contract only** ([production-maturity](./production-maturity.md)).

---

## YOLO AWS (reference production-like run)

**Reference run:** `c55adc33` — **SUCCESS** via **lifecycle-train** path (`POST .../runs/trigger` or Hub **Train with model** with explicit **`dataset_version_id`**).

Use this run in papers and ops docs as the **canonical MLAir path** screenshot / citation:

- One **`run_id`** in Hub Runs and run detail
- Lineage edges from plugin task ingest
- Resource usage on run/task detail ([resource-usage-contract-v1](./resource-usage-contract-v1.md))
- Optional: `training.completed` semantic event when run succeeds with pinned version

**Do not** describe this run as “YOLO triggered from Airflow then synced to Hub.”

---

## E2 baseline (Airflow + MLflow) — comparison only

**Purpose:** Re-run experiments for **paper tables** (time-to-train, operator steps, reproducibility friction).

| Aspect | E2 baseline | MLAir path |
| --- | --- | --- |
| Orchestration | External DAG scheduler | MLAir scheduler + pipeline version |
| Tracking | External experiment store | Run tracking + Hub |
| Dataset pin | Often implicit / manual | **`dataset_version_id` required** (strict prod) |
| Identity | Multiple ids + glue scripts | **Single Hub `run_id`** |
| Ops runbook | Lab-only | [production-strict-lifecycle](../runbooks/production-strict-lifecycle.md) |

**Paper figure captions:** label E2 panels explicitly as **“comparison baseline (not MLAir deployment)”**.

**Repo docs:** link E2 only from research / evaluation sections — not from [getting-started/run-first-pipeline](../getting-started/run-first-pipeline.md) or operator sign-off.

---

## Documentation split (checklist for authors)

- [ ] Operator guides and runbooks describe **Hub → API → plugin** only.
- [ ] Benchmark / ablation sections cite **E2** with “comparison baseline” language.
- [ ] Case study screenshots use **MLAir run detail** (`c55adc33` or current SUCCESS run), not MLflow UI alone.
- [ ] No runbook step says “copy run id from Airflow into MLAir.”
- [ ] Train paths document **`dataset_version_id`** on every automation example.

## Related

- [Run your first pipeline (lifecycle-first)](../getting-started/run-first-pipeline.md)
- [Dataset Hub and Readiness](./dataset-hub-and-readiness.md)
- [Legacy compatibility sunset](../runbooks/legacy-compat-sunset.md)
- [Production strict lifecycle](../runbooks/production-strict-lifecycle.md)
