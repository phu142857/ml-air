# CLI Commands

## `mlair dev up`

Start local stack (no rebuild).

```bash
python ./mlair dev up
```

## `mlair run <pipeline-file>`

Trigger pipeline run from YAML/JSON file.

```bash
python ./mlair run examples/pipeline.demo.yaml
```

## `mlair logs <run_id>`

Read run logs.

```bash
python ./mlair logs <run_id> --limit 100
```
