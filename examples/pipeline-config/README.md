# Pipeline config templates (import wizard)

Hub **Import pipeline** serves templates from `frontend/public/pipeline-config/`.

| File | Use case |
|------|----------|
| `train-only.yaml` | Single-step demo (`echo_tracking`) |
| `multi-step-demo.yaml` | Three-step DAG with built-in `echo_tracking` |

Project-specific examples (YOLO, Vet-AI, etc.) live under `external/` for reference only — not shown in the Hub wizard.

Import schema:

```yaml
inputs: [...]   # optional
tasks: [...]    # required
```

`pipeline_id` is entered in the wizard; zip bundles may include `manifest.yaml` + `config_file`.
