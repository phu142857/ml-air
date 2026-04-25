# Create Plugin (Step-by-step)

Goal: a new developer can create a plugin, load it into the API runtime, and trigger a successful run without changing core services.

## 1) Create a plugin skeleton

```python
from sdk.plugin_contract import PluginInterface, PluginMeta


class DemoTrainPlugin(PluginInterface):
    meta = PluginMeta(
        name="demo_train",
        version="0.1.0",
        engine_version="1.0.0",
        inputs={"type": "object"},
        outputs={"type": "object"},
        lineage={"inputs": ["raw_data"], "outputs": ["features"]},
    )

    def execute(self, context: dict) -> dict:
        return {
            "params": {"source": "plugin_demo"},
            "metrics": {"train_score": {"step": 1, "value": 0.91}},
            "artifacts": [{"path": "models/model.pkl", "uri": "s3://mlair/models/model.pkl"}],
            "lineage": {
                "inputs": [{"name": "raw_data", "version": "v1", "uri": "s3://mlair/raw/v1.parquet"}],
                "outputs": [{"name": "features", "version": "v1", "uri": "s3://mlair/features/v1.parquet"}],
            },
        }
```

## 2) Register an entry point

In your plugin package (`pyproject.toml`):

```toml
[project.entry-points."mlair.plugins"]
demo_train = "my_plugin.demo_train:DemoTrainPlugin"
```

## 3) Install the plugin into API runtime

```bash
pip install my-plugin-package
```

If you run with container images, make sure the plugin is installed in the `api` image.

## 4) Reload plugin registry

```bash
curl -X POST "http://localhost:8080/v1/plugins/reload" \
  -H "Authorization: Bearer admin-token"
```

## 5) Verify the plugin is loaded

```bash
curl -H "Authorization: Bearer viewer-token" \
  "http://localhost:8080/v1/plugins"
```

## 6) Validate plugin with a sample context

```bash
curl -X POST "http://localhost:8080/v1/plugins/demo_train/validate" \
  -H "Authorization: Bearer maintainer-token" \
  -H "Content-Type: application/json" \
  -d '{"context":{"sample":true}}'
```

## 7) Trigger a run using the plugin

```bash
curl -X POST "http://localhost:8080/v1/tenants/default/projects/default_project/runs" \
  -H "Authorization: Bearer maintainer-token" \
  -H "Content-Type: application/json" \
  -d '{"pipeline_id":"demo_pipeline","plugin_name":"demo_train","idempotency_key":"plugin-demo-001"}'
```

## Common Errors

- `plugin_not_found_or_disabled`: plugin was not reloaded or is currently disabled.
- `duplicate plugin name`: `meta.name` conflicts with another loaded plugin.
- `incompatible engine_version`: `engine_version` in `PluginMeta` is below the minimum supported engine version.
- `invalid lineage meta`: invalid lineage keys (`inputs|outputs`) or invalid slot naming pattern.
- Trigger succeeds but run is `FAILED`: inspect run logs and check `plugin_exec.error`.

## Sample log for plugin failure

```text
2026-04-25T14:35:22.178734+00:00 [ERROR] task <run_id>:extract finished with FAILED
```
