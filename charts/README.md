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

## Staging values

Use `charts/ml-air/values-staging.yaml` as a baseline for staging rollout.

JWT secret options:

- **Chart-managed Secret** (default):
  - set `api.secret.value`
- **Existing Secret**:
  - set `api.secret.existingSecretName`
  - set `api.secret.key`
- **External Secrets Operator**:
  - set `api.secret.externalSecret.enabled=true`
  - fill `api.secret.externalSecret.secretStoreRef.*`
  - fill `api.secret.externalSecret.remoteRef.*`
- **Bitnami SealedSecret**:
  - set `api.secret.sealedSecret.enabled=true`
  - set `api.secret.sealedSecret.encryptedData` (output from `kubeseal`)
  - keep `api.secret.externalSecret.enabled=false`

CI injects JWT secret via:

`--set-string api.secret.value=<secret>`
