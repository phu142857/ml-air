# Plugin

A **plugin** is a named pipeline step capability registered in the API/executor environment (`meta.name` ↔ YAML `plugin:`).

## What it is

- Python package entry point under `mlair.plugins` (or HTTP tasks without Python).
- Contract: `meta`, `validate()`, `run(context)` — MLAir owns orchestration; the plugin owns step logic.
- Hot-reloadable via `POST /v1/plugins/reload` when installed in the runtime image.

## When to use

- Custom train/ETL/adapters that must participate in retries, tracking, and lineage.
- External workers that execute the same plugin name from a lease payload.

## Related

- [Plugin development guide](../plugin-development-guide.md)
- Guides: [Create a Plugin](../guides/create-plugin.md), [Plugin versioning](../guides/plugin-versioning.md), [Integrate App with Plugin](../guides/integrate-app-with-plugin.md)
- Concepts: [Pipeline](./pipeline.md), [Task](./task.md)
