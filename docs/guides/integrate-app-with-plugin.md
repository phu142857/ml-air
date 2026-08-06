# Integrate App with Plugin

## Goal

Connect an existing app workflow to MLAir through a plugin adapter.

## Steps

1. Implement your app adapter in a plugin package (see [Create Plugin](./create-plugin.md)).
2. Install plugin package into API/runtime environment and reload plugin registry.
3. Reference plugin name in pipeline task (`plugin: <meta.name>`).
4. Trigger run and verify logs, metrics, artifacts, and lineage.

## Command

**Auth:** `$TOKEN` from [Login and Identity](./login-and-identity.md) (maintainer+).

```bash
API="${ML_AIR_BASE_URL:-http://localhost:8080}"

# Verify plugin is registered (API — not a CLI subcommand)
curl -sS "$API/v1/plugins" \
  -H "Authorization: Bearer $TOKEN"

# Headless smoke: trigger run that references plugin name in pipeline YAML
python ./mlair run examples/pipeline.custom-plugin.yaml
```

## Result

App logic runs inside MLAir task lifecycle with retries, logs, and lineage.

## Notes

- Plugin discovery is server-side (API/executor runtime), not browser-side.
- If plugin is not listed, check package install location and run plugin reload.
- Keep plugin `validate()` strict for early failure and clearer operator feedback.

## Done

Continue with [Debugging](./debugging.md).
