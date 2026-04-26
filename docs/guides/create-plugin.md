# Create Plugin

## Goal

Create and register a plugin that emits params, metrics, artifacts, and lineage.

## Steps

1. Implement plugin contract.
2. Register entry point.
3. Install plugin package into API runtime.
4. Reload and validate plugin.
5. Trigger a run with plugin.

## Command

```bash
curl -X POST "http://localhost:8080/v1/plugins/reload" \
  -H "Authorization: Bearer admin-token"

curl -X POST "http://localhost:8080/v1/plugins/demo_train/validate" \
  -H "Authorization: Bearer maintainer-token" \
  -H "Content-Type: application/json" \
  -d '{"context":{"sample":true}}'
```

## Result

Plugin appears in `/v1/plugins`, validation returns success, and run can be triggered using `plugin_name`.

## Done

Use [Debug Failure Guide](./debug-failure.md) if plugin runs fail.
