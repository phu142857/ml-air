# Create Plugin

## Goal

Create a custom plugin package, register it into MLAir via entry points, and make it visible in `/plugins`.

## Steps

1. Create a Python package for your plugin.
2. Expose plugin classes via entry point group `mlair.plugins`.
3. Install the package into the same environment as the API service.
4. Reload registry and verify plugin list.
5. Validate plugin context and run a pipeline task using that plugin.

## Command

```bash
# 1) Create package skeleton
mkdir -p /tmp/my-mlair-plugins/my_mlai_plugins
cd /tmp/my-mlair-plugins

cat > pyproject.toml <<'EOF'
[build-system]
requires = ["setuptools>=68"]
build-backend = "setuptools.build_meta"

[project]
name = "my-mlair-plugins"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = []

[project.entry-points."mlair.plugins"]
my_train_plugin = "my_mlai_plugins.plugins:MyTrainPlugin"

[tool.setuptools.packages.find]
where = ["."]
include = ["my_mlai_plugins*"]
EOF

cat > my_mlai_plugins/__init__.py <<'EOF'
"""Custom plugins for MLAir."""
EOF

cat > my_mlai_plugins/plugins.py <<'EOF'
from __future__ import annotations

from typing import Any


class MyTrainPlugin:
    meta = {
        "name": "my_train_plugin",
        "version": "0.1.0",
        "engine_version": "1.0.0",
        "inputs": {"dataset_uri": "string"},
        "outputs": {"model_uri": "string"},
        "ui_schema": None,
        "lineage": {"inputs": ["dataset"], "outputs": ["model"]},
    }

    def validate(self, context: dict[str, Any]) -> bool:
        # Keep lightweight checks here: required keys, ranges, formats.
        if "dataset_uri" not in context:
            raise ValueError("dataset_uri is required")
        return True
EOF

# 2) Install into API runtime env (same venv/container where api runs)
pip install -e .

# 3) Reload and verify from MLAir API
curl -X POST "http://localhost:8080/v1/tenants/default/projects/default_project/plugins/reload" \
  -H "Authorization: Bearer admin-token"

curl "http://localhost:8080/v1/tenants/default/projects/default_project/plugins" \
  -H "Authorization: Bearer viewer-token"

# 4) Validate plugin context
curl -X POST "http://localhost:8080/v1/tenants/default/projects/default_project/plugins/my_train_plugin/validate" \
  -H "Authorization: Bearer maintainer-token" \
  -H "Content-Type: application/json" \
  -d '{"context":{"dataset_uri":"s3://bucket/datasets/train.parquet"}}'

# 5) Optional smoke run with bundled example
python ./mlair run examples/pipeline.custom-plugin.yaml
```

## Result

Your custom plugin appears in plugin list, passes validation, and can be referenced by pipeline tasks through `plugin`.

## Success Checklist

- `GET /plugins` returns `my_train_plugin`.
- `POST /plugins/my_train_plugin/validate` returns `{"ok": true}`.
- `python ./mlair run examples/pipeline.custom-plugin.yaml` starts successfully.
- Failed validation returns a clear error message from `validate()`.

## Notes

- `meta.name` should match the plugin name used in pipeline config (`task.plugin`).
- `engine_version` must satisfy API loader compatibility checks.
- The API only discovers plugins installed in its own Python environment.
- If `reload` is restricted in your environment, restart API to trigger registry reload at startup.

## Done

Continue with [Validate a Plugin](./validate-plugin.md), [Reload Plugin Registry](./reload-plugin.md), and [Integrate App with Plugin](./integrate-app-with-plugin.md).
