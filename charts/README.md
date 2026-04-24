# Helm Charts

Baseline Helm chart for ML-AIR lives at `charts/ml-air`.

## Validate chart

```bash
helm lint charts/ml-air
helm template ml-air charts/ml-air
```

## Install (example)

```bash
helm install ml-air charts/ml-air --namespace ml-air --create-namespace
```
