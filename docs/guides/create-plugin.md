# Create Plugin

## Goal

Create and register a plugin that emits params, metrics, artifacts, and lineage.

## Steps

1. Implement plugin contract.
2. Reload plugin registry.
3. Validate plugin runtime.
4. Trigger a pipeline task using plugin.

## Command

```bash
curl -X POST "http://localhost:8080/v1/tenants/default/projects/default_project/plugins/reload" \
  -H "Authorization: Bearer maintainer-token"

curl -X POST "http://localhost:8080/v1/tenants/default/projects/default_project/plugins/demo_train/validate" \
  -H "Authorization: Bearer maintainer-token" \
  -H "Content-Type: application/json" \
  -d '{"context":{"sample":true}}'

python ./mlair run examples/pipeline.demo.yaml
```

## Result

Plugin loads successfully, validation returns success, and pipeline tasks can execute with that plugin.

## Success Checklist

- Plugin appears in plugin list.
- Pipeline run with plugin starts successfully.
- At least one plugin task reaches `SUCCESS`.
- Lineage and run metadata are attached to the run.

## Done

Continue with [Validate a Plugin](./validate-plugin.md) and [Integrate App with Plugin](./integrate-app-with-plugin.md).
