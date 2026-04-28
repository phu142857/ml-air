# Hybrid Dataset-to-Train Architecture (Business + MLAir)

## 1) Flow tổng

```text
Upload CSV
-> Business validate + profile
-> Save dataset_version (status)
-> User bấm Train
-> Business gọi MLAir
-> MLAir validate theo pipeline + train
-> Trả run_id hoặc error
```

## 2) Phân vai

### Business app

- Upload CSV
- Validate cơ bản (schema, null, duplicate)
- Tính `quality_score`
- Áp business rules
- Quyết định có cho train ở UI hay không

### MLAir

- Validate theo pipeline
- ML preprocessing (encode/scale/split)
- Train + evaluate
- Reject nếu schema không phù hợp

## 3) Data model chuẩn

### `dataset_version` shape

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

## 4) Business validation tham chiếu

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

## 5) API contract

### Business dataset APIs

- `POST /datasets/upload`
- `GET /datasets`
- `GET /datasets/{id}/versions`

### Business -> MLAir train API

- `POST /mlair/train`

```json
{
  "dataset_version_id": "v3",
  "model_id": "m1"
}
```

## 6) MLAir training logic (tham chiếu)

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

## 7) UI behavior

### Bảng version

```text
Version   Status   Score   Action
v3        warning  72      View | Train
v4        failed   0       View
```

### Status logic

- `ready` -> cho train
- `warning` -> cho train
- `failed` -> disable train

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

## 8) Frontend train flow

```ts
async function train(versionId) {
  const res = await api.post("/mlair/train", {
    dataset_version_id: versionId,
    model_id: selectedModel
  });
  if (res.run_id) router.push(`/runs/${res.run_id}`);
}
```

## 9) Quy tắc quan trọng

- Business validate để hiển thị status và quyết định UX.
- MLAir validate lại để đảm bảo train đúng theo pipeline.
- Không đưa ML training logic sang business app.
- Không để MLAir tin tuyệt đối status từ business app.

## 10) Train log chuẩn

```json
{
  "dataset_version": "v3",
  "status_business": "warning",
  "status_mlair": "accepted",
  "model_version": "v2.1"
}
```

## 11) Kết luận

- Business: validate + quản lý dataset/version
- MLAir: ML processing + train + evaluate
- Hai lớp validation độc lập
- UI luôn hiển thị status + detail
- Train bị block khi `failed`
