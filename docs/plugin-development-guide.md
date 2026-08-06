# Plugin development guide

## Goal

Extend MLAir with custom pipeline steps (plugins) using **documented contracts only** — package, register, validate, and run without reading orchestrator internals.

## Mental model

| Term | Meaning |
|------|---------|
| **Plugin** | Named task capability (`meta.name` in pipeline YAML) |
| **Entry point** | Python package exposes classes via `mlair.plugins` group |
| **Execution mode** | **internal** (built-in executor) or **external** (leased worker) — [Task execution mode](./concepts/task-execution-mode.md) |

MLAir owns orchestration, retries, tracking, and lineage; your plugin owns the step logic.

## Quick path (copy-paste)

Follow [Create a Plugin](./guides/create-plugin.md) end-to-end:

1. Scaffold a Python package with `pyproject.toml` entry point `mlair.plugins`.
2. Implement `meta`, `validate()`, and `run(context)`.
3. Install into the **API/executor Python environment** (same image or volume).
4. `POST /plugins/reload` or restart API.
5. Run `examples/pipeline.custom-plugin.yaml` or Hub pipeline with your plugin name.

## Guide index

| Task | Document |
|------|----------|
| Scaffold and register | [Create a Plugin](./guides/create-plugin.md) |
| Pre-flight checks | [Validate a Plugin](./guides/validate-plugin.md) |
| Hot reload registry | [Reload Plugin Registry](./guides/reload-plugin.md) |
| App + plugin integration | [Integrate App with Plugin](./guides/integrate-app-with-plugin.md) |
| Version compatibility | [Plugin versioning](./guides/plugin-versioning.md) |
| Concept overview | [Plugin (concept)](./concepts/plugin.md) |
| HTTP-only tasks (no Python plugin) | [HTTP pipeline tasks](./guides/http-pipeline-tasks.md) |

## Contract checklist

- [ ] `meta.name` matches `plugin:` field in pipeline task config.
- [ ] `engine_version` satisfies API loader compatibility.
- [ ] `validate()` returns structured errors before run is scheduled.
- [ ] `run()` uses `context` APIs for logging, metrics, artifacts (see create-plugin examples).
- [ ] Package installed in executor environment when using **internal** mode.
- [ ] For **external** workers, plugin name matches lease payload — [External worker execution](./guides/external-worker-execution.md).

## Verify in running stack

```bash
export TOKEN="$(python scripts/identity_smoke_token.py)"
export API="${ML_AIR_BASE_URL:-http://localhost:8080}"

curl -sS -H "Authorization: Bearer $TOKEN" "$API/v1/plugins" | jq .
curl -sS -X POST -H "Authorization: Bearer $TOKEN" "$API/v1/plugins/my_train_plugin/validate"
mlair run examples/pipeline.custom-plugin.yaml
```

## Troubleshooting

| Issue | Doc |
|-------|-----|
| Plugin not in list | Not installed in API env — rebuild image or pip install in container |
| Validate fails | [Validate a Plugin](./guides/validate-plugin.md) |
| Task fails at runtime | [Debugging](./guides/debugging.md) |
| Manifest / signing errors | [Verify manifest](./guides/verify-manifest.md) |

## Done

Continue with [Validate a Plugin](./guides/validate-plugin.md) and [Integrate App with Plugin](./guides/integrate-app-with-plugin.md).
