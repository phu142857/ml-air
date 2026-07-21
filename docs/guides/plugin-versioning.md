# Plugin versioning and compatibility

MLAir tracks three version axes for plugins:

| Field | Meaning |
| --- | --- |
| `meta.version` | Plugin package release (PEP 440) |
| `meta.engine_version` | Minimum MLAir engine API the plugin was built against |
| `meta.contract_version` | Plugin SDK contract revision (default `1.0`) |

## Compatibility matrix

Shipped in [`sdk/plugin_compatibility_matrix.json`](../../sdk/plugin_compatibility_matrix.json):

- **Engine** — `supported_range` (default `>=1.0.0,<2.0.0`) applies to each plugin’s `engine_version`.
- **Per-plugin** — optional `version_range` for registered names (e.g. `echo_tracking`).
- **Runtime engine** — `MLAIR_ENGINE_VERSION` env (default `1.0.0`) is reported in API responses.

## Pipeline version pins

Pin a task to an installed plugin version:

```json
{
  "id": "train",
  "plugin": "echo_tracking",
  "plugin_version": ">=0.1.0,<1.0.0"
}
```

Alias: `requires_plugin_version`. Validated on `POST /v1/pipelines/validate` and when creating runs (if `MLAIR_PLUGIN_VERSION_ENFORCE=1`, default).

## API

| Method | Path |
| --- | --- |
| `GET` | `/v1/plugins/compatibility-matrix` |
| `GET` | `/v1/plugins/{name}/compatibility?version_constraint=` |
| `GET` | `/v1/plugins` | includes `compatibility` per plugin |

## Enforcement

| Variable | Default | Effect |
| --- | --- | --- |
| `MLAIR_PLUGIN_VERSION_ENFORCE` | `1` | Block runs when installed plugin fails matrix checks |
| `MLAIR_ENGINE_VERSION` | `1.0.0` | Reported engine version in compatibility payloads |

Code: [`sdk/plugin_versioning.py`](../../sdk/plugin_versioning.py), [`api/app/plugins/compatibility_service.py`](../../api/app/plugins/compatibility_service.py).
