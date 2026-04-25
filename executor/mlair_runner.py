from __future__ import annotations

import json
import sys


def main() -> int:
    plugin_name = sys.argv[1] if len(sys.argv) > 1 else ""
    raw = sys.stdin.read().strip() or "{}"
    context = json.loads(raw)

    if plugin_name in {"echo_tracking", "app_train_adapter", "app_etl_adapter"}:
        metrics = context.get("metrics", {"accuracy": {"value": 0.9, "step": 1}})
        default_source = "plugin"
        if plugin_name == "app_train_adapter":
            default_source = "app_train_adapter"
        elif plugin_name == "app_etl_adapter":
            default_source = "app_etl_adapter"
        params = context.get("params", {"source": default_source})
        artifacts = context.get("artifacts", [{"path": "plugin_output.json", "uri": "s3://mlair/plugin/output.json"}])
        lineage = context.get(
            "lineage",
            {
                "inputs": [
                    {"name": "raw_data", "version": "v1", "uri": "s3://mlair/bucket/raw.parquet"},
                ],
                "outputs": [
                    {"name": "clean_data", "version": "v1", "uri": "s3://mlair/bucket/clean.parquet"},
                ],
            },
        )
        out = {"params": params, "metrics": metrics, "artifacts": artifacts, "lineage": lineage}
    else:
        out = {"params": {}, "metrics": {}, "artifacts": []}

    print(json.dumps(out))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
