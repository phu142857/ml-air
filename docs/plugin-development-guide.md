# MLAir Plugin Development Guide

## 1) Plugin contract

Use `sdk/plugin_contract.py`:

- `PluginMeta`: `name`, `version`, `engine_version`, `inputs`, `outputs`, `ui_schema`
- `PluginInterface.execute(context) -> dict`
- Built-in schema validation (JSON schema for input/output)
- Engine compatibility check (`engine_version >= 1.0.0`)

## 2) Hello world plugin

```python
from sdk.plugin_contract import PluginInterface, PluginMeta


class HelloPlugin(PluginInterface):
    meta = PluginMeta(
        name="hello",
        version="0.1.0",
        engine_version="1.0.0",
        inputs={"type": "object", "properties": {"name": {"type": "string"}}, "required": ["name"]},
        outputs={"type": "object", "properties": {"message": {"type": "string"}}, "required": ["message"]},
        ui_schema={"metrics": ["message_count"], "charts": ["stat"]},
    )

    def execute(self, context: dict) -> dict:
        return {"message": f"hello {context['name']}"}
```

## 3) Entry point packaging

In plugin package `pyproject.toml`:

```toml
[project.entry-points."mlair.plugins"]
hello = "my_plugin.hello:HelloPlugin"
```

Install:

```bash
pip install my-plugin-package
```

## 4) Runtime API

- `GET /v1/plugins`
- `GET /v1/plugins/{name}`
- `POST /v1/plugins/{name}/validate`
- `POST /v1/plugins/reload`
- `POST /v1/plugins/{name}/toggle`

## 5) Debug checklist

- Ensure plugin package is installed in API runtime image/environment.
- Call `POST /v1/plugins/reload` after install/update.
- Check `/v1/plugins` for loader errors.
- Use `/v1/plugins/{name}/validate` with sample context before production use.
