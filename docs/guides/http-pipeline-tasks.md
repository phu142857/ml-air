# HTTP pipeline tasks

Generic outbound HTTP steps in a pipeline DAG (Phase 8 MVP), executed by the **executor** when a task is declared with `"type": "http"`.

## Task shape

```json
{
  "id": "notify",
  "type": "http",
  "depends_on": ["train"],
  "http": {
    "method": "POST",
    "url": "https://hooks.internal.example.com/mlair/hook",
    "headers": { "X-Custom": "mlair" },
    "json_body": { "event": "task.done" },
    "secret_env": "MLAIR_HTTP_TASK_BEARER_TOKEN",
    "timeout_seconds": 30
  }
}
```

- **`secret_env`** — name of an environment variable on the **executor** process; when set, sent as `Authorization: Bearer <value>`.
- **`json_body`** — static object/array, or Jinja template strings; merged with JSONPath base when `json_body_jsonpath` is set.
- **`json_body_jsonpath`** — optional JSONPath into run `context` (e.g. `$.params`, `$.metrics[0]`) as the base object before `json_body` merge.
- **Jinja variables** — `run_id`, `task_id`, `tenant_id`, `project_id`, `pipeline_id`, `trace_id`, `params`, `metrics`, `lineage`, `context`, limited `env.*` (`MLAIR_HTTP_TEMPLATE_*` / `MLAIR_HTTP_TASK_*` only).

Example with templates:

```json
{
  "id": "notify",
  "type": "http",
  "http": {
    "method": "POST",
    "url": "https://hooks.internal.example.com/runs/{{ run_id }}",
    "headers": { "X-MLAir-Task": "{{ task_id }}" },
    "json_body_jsonpath": "$.params",
    "json_body": {
      "event": "training.notify",
      "trace_id": "{{ trace_id }}"
    }
  }
}
```

Set `ML_AIR_HTTP_TASK_TEMPLATES=0` to use legacy shallow merge only (no Jinja).

Plugin tasks and HTTP tasks are **mutually exclusive** per task id.

## Allowlist

Target host must appear in:

1. `ML_AIR_HTTP_TASK_ALLOWED_HOSTS` (comma-separated hostnames), or
2. If unset, `ML_AIR_WEBHOOK_ALLOWED_HOSTS`.

Validate before run:

```bash
curl -X POST "$API/v1/pipelines/validate" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"config":{"tasks":[{"id":"n","type":"http","http":{"url":"https://hooks.internal.example.com/h"}}]}}'
```

## Retry

HTTP failures use the existing task **attempt / backoff** loop in the scheduler (5xx and 429 are marked retryable in the executor result). Dedicated per-task HTTP retry policies are not in MVP.

## Code

- Contract: [`sdk/http_task_contract.py`](../../sdk/http_task_contract.py)
- Executor: [`executor/http_task_runner.py`](../../executor/http_task_runner.py)
- Scheduler enqueues `task_type=http` + `http_task` on the internal Redis queue (even when `ML_AIR_TASK_EXECUTION_MODE=external`).

## Example

See [`examples/pipeline.http-notify.yaml`](../../examples/pipeline.http-notify.yaml).
