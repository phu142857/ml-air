# Hybrid Dataset-to-Train Architecture (Business + MLAir)

## Goal

Provide a production-ready hybrid workflow where:

- Business applications manage dataset quality/governance and user-facing validation.
- MLAir owns ML validation, pipeline execution, training, and evaluation.
- Training lineage remains traceable from dataset version to run to model version.

## Primary UX (lifecycle-centric)

### Materialize (immutable version)

Maintainers can turn the **mutable accumulation buffer** into a new **`dataset_versions`** row via either path (same server behavior):

- `POST /v1/tenants/{tenant_id}/projects/{project_id}/datasets/{dataset_id}/materialize`
- `POST .../datasets/{dataset_id}/buffer/materialize` (legacy path; identical semantics)

Eligible buffer strategies include **`manual_materialize_only`** and **`snapshot_on_schedule`** (see Dataset Hub Accumulation tab and [`readiness-and-gating.md`](../api/readiness-and-gating.md)). Schedule-wide ticks use `POST .../datasets/buffer/materialize-scheduled`.

Strategy reference: [Dataset accumulation strategies](./dataset-accumulation-strategies.md).

Recommended navigation:

1. Open `Datasets` and select dataset hub (`/datasets/{dataset_id}`).
2. Evaluate **training eligibility**: `GET .../datasets/{dataset_id}/readiness` with a chosen `policy_id` and `dataset_version_id` (policy owns thresholds such as `required_size`; the response includes `eligibility_status` and `eligibility_criteria`).
3. Select model + dataset version.
4. Trigger training via intent-driven endpoint (`POST /runs/trigger`).
5. Track run and readiness snapshot in run detail.

Model detail remains governance-focused; legacy training forms are compatibility tools.

## Steps

1. Upload CSV and create a dataset version.
2. Run business validation and persist quality metadata (`status`, `score`, `summary`, `details`).
3. Show dataset quality in UI and gate training when status is `failed`.
4. Trigger MLAir training with selected model and dataset version.
5. Enforce MLAir-side schema validation before training starts.
6. Track run output and model-version lineage for auditability.

## Flow

```text
Upload CSV
-> Business validates and profiles data
-> Save dataset_version with status
-> User clicks Train
-> Business calls MLAir
-> MLAir validates against pipeline and trains
-> Returns run_id or error
```

## Responsibility Split

### Business app

- Upload CSV
- Run basic validation (schema, nulls, duplicates)
- Compute `quality_score`
- Apply business rules
- Decide whether training should be enabled in UI

### MLAir

- Validate dataset against pipeline requirements
- Run ML preprocessing (encoding/scaling/splitting)
- Train and evaluate model
- Reject incompatible schemas

## Data Model

### `dataset_version` payload

```json
{
  "version_id": "v3",
  "dataset_id": "ds_1",
  "status": "warning",
  "quality_score": 72,
  "summary": ["High missing values"],
  "details": [
    {
      "column": "weight",
      "issue": "missing",
      "value": 0.38,
      "severity": "warning"
    }
  ],
  "created_at": "..."
}
```

## Business Validation (Reference)

```python
import pandas as pd

def validate_dataset(file_path, required_cols):
    df = pd.read_csv(file_path)
    if df.empty:
        return {"status": "failed", "summary": ["empty dataset"]}

    missing = set(required_cols) - set(df.columns)
    if missing:
        return {"status": "failed", "summary": [f"missing: {missing}"]}

    status = "ready"
    score = 100
    summary = []
    details = []

    null_ratio = df.isnull().mean()
    for col, val in null_ratio.items():
        if val > 0.6:
            status = "failed"
        elif val > 0.3:
            status = "warning"
            score -= 20
            summary.append("high missing")
            details.append({
                "column": col,
                "issue": "missing",
                "value": float(val),
                "severity": "warning"
            })

    return {
        "status": status,
        "quality_score": score,
        "summary": list(set(summary)),
        "details": details
    }
```

## API Contract

### Business dataset APIs

- `POST /datasets/upload`
- `GET /datasets`
- `GET /datasets/{id}/versions`

### Business -> MLAir training API

- `POST /mlair/train`

```json
{
  "dataset_version_id": "v3",
  "model_id": "m1"
}
```

## MLAir Training Logic (Reference)

```python
def train(dataset, pipeline):
    validate_schema(dataset, pipeline)
    X, y = preprocess(dataset, pipeline)
    X_train, X_val = split(X, y)
    model = fit(X_train, y)
    metrics = evaluate(model, X_val, y)
    return model, metrics
```

```python
def validate_schema(df, pipeline):
    required = pipeline["features"] + [pipeline["target"]]
    missing = set(required) - set(df.columns)
    if missing:
        raise Exception(f"missing columns: {missing}")
```

## UI Behavior

### Version table

```text
Version   Status   Score   Action
v3        warning  72      View | Train
v4        failed   0       View
```

### Status logic

- `ready` -> training allowed
- `warning` -> training allowed
- `failed` -> training disabled

```tsx
<button
  disabled={v.status === "failed"}
  onClick={() => train(v.version_id)}
>
  Train
</button>
```

### Detail modal

```text
Status: warning
Score: 72

Summary:
- high missing

Details:
- weight: 38% missing
```

## Frontend Train Flow

```ts
async function train(versionId) {
  const res = await api.post("/mlair/train", {
    dataset_version_id: versionId,
    model_id: selectedModel
  });
  if (res.run_id) router.push(`/runs/${res.run_id}`);
}
```

## Critical Rules

- Business validation is for governance and UX decisions.
- MLAir must re-validate before training.
- Keep ML training logic inside MLAir.
- MLAir must never blindly trust business-side status.

## Standard Training Log

```json
{
  "dataset_version": "v3",
  "status_business": "warning",
  "status_mlair": "accepted",
  "model_version": "v2.1"
}
```

## Conclusion

- Business: validation + dataset/version management
- MLAir: ML processing + training + evaluation
- Two independent validation layers
- UI always shows status and details
- Training is blocked when status is `failed`

## Implemented Changes

### Backend + database

- Added migration for `dataset_versions`:
  - `status` (`ready|warning|failed`)
  - `quality_score` (int)
  - `summary` (text[])
  - `details` (jsonb)
- CSV upload (`POST /v1/tenants/{tenant}/projects/{project}/datasets/upload`) now supports:
  - internal business validation
  - optional `required_cols` (Form JSON array string)
- Dataset version list/get APIs now return:
  - `status`, `quality_score`, `summary`, `details`

### Frontend (Datasets page)

- Version table includes `Status` and `Score`.
- Training rule:
  - `ready`: enabled
  - `warning`: enabled
  - `failed`: disabled
- Actions are icon-based:
  - info (View), start (Train), delete (Delete version)
- `View` modal displays:
  - Status, Score
  - Summary
  - Human-readable details (`weight: 38% missing (warning)`)
  - Severity-based colors (`warning/error/info`)
- `Delete Dataset` button is aligned in the same row as the dataset version title.

## Unified Datetime Format Across Frontend

Datetime display has been standardized to:

```text
HH:mm:ss DD/MM/YYYY (UTC±X)
```

Example: `19:45:03 28/04/2026 (UTC+7)`

Applied across:

- `datasets`
- `models`
- `model detail`
- `runs history`
- `pipeline versions`
- `run detail logs`

Using shared helper: `formatDateTimeCompact()` in `frontend/lib/utils.ts`.

## Model + dataset trigger (MLAir-native)

The Datasets UI can call **`POST /v1/tenants/{tenant}/projects/{project}/runs/trigger`** so users pick **model** and **dataset version** only; MLAir resolves **default pipeline** (`model_pipeline_mapping` or latest run linkage) and injects **production / latest `artifact_uri`** into run **`plugin_context`** when available. See:

- [Model-centric pipeline mapping and run trigger](./model-centric-pipeline-mapping-and-trigger.md)

## Model page governance mode

Model detail is governance-only (status, policy, approvals, versions). Dataset upload/readiness/train flows are intentionally owned by Dataset Hub.

See:

- [Model page governance mode](./model-page-governance-mode.md)
- [Dataset Hub and Readiness](./dataset-hub-and-readiness.md)

## Deploy and Verification Checklist

1. Run migration:
   - `alembic upgrade head`
2. Restart API and frontend.
3. Upload one CSV on `Datasets`.
4. Verify `Status` and `Score` appear in version table.
5. Click `View` and verify `Summary`/`Details`.
6. Confirm `failed` versions cannot be trained.
7. Trigger train for `ready|warning` versions and verify redirect to run detail.

## Operational Notes

- Business status is a governance/UX layer.
- MLAir must always validate schema before training.
- Do not bypass MLAir validation even when business status is `ready`.
