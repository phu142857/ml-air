"""Execute pipeline HTTP tasks in the executor process."""

from __future__ import annotations

import os
import sys
from typing import Any

_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

from sdk.http_task_contract import execute_http_task  # noqa: E402


def run_http_task(http_cfg: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
    result = execute_http_task(http_cfg, context=context, environ=os.environ)
    return {"ok": bool(result.get("ok")), "result": result, "error": result.get("error")}
