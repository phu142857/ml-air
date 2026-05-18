# Hub lifecycle-first UX (Wave 4)

## Defaults

| Entry | Behavior |
| --- | --- |
| `/` | Redirects via **`hub_default_route`** from runtime-config (default **`datasets`**; set `ML_AIR_HUB_DEFAULT_ROUTE=lifecycle` for maintainers) |
| Sidebar logo | Links to **`/datasets`** |
| Sidebar order | **Lifecycle** (Datasets, Lifecycle, Models) → Overview → Execution → Admin |

Pipelines and runs remain available under **Execution** — they are observability/substrate, not the primary operator path.

## Blocked readiness (Dashboard)

On **`/dashboard`**, the **Datasets** stat card shows a subline when there are recent blocked readiness evaluations in scope (e.g. `3 blocked readiness`), sourced from the audit timeline filter `readiness_status=blocked`.

## OpenTelemetry (POST bodies)

When `ML_AIR_OTEL_ENABLED=1`, JSON bodies for:

- `POST .../readiness/evaluate`
- `POST .../models/.../promote`

…are merged onto the HTTP span (`mlair.dataset_version_id`, `mlair.policy_id`, `mlair.target_stage`, `mlair.model_version`, …) in addition to path/query attributes.

## Configurable home route (Wave 5)

API / runtime-config:

```bash
ML_AIR_HUB_DEFAULT_ROUTE=datasets   # default
# ML_AIR_HUB_DEFAULT_ROUTE=lifecycle
# ML_AIR_HUB_DEFAULT_ROUTE=dashboard
# ML_AIR_HUB_DEFAULT_ROUTE=models
```

`GET /v1/runtime-config` → `hub_default_route`. On load, `AppProviders` always fetches runtime-config and merges into `window.__ML_AIR_RUNTIME_CONFIG__`, then dispatches `mlair-runtime-config-updated`. `/` waits for that event (2.5s fallback) before redirecting.

## Related

- [Dataset Hub and Readiness](./dataset-hub-and-readiness.md)
- [OpenTelemetry](./opentelemetry.md)
