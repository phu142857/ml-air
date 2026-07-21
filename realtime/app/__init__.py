# MLAir realtime WebSocket fan-out service.
from __future__ import annotations

from pathlib import Path

import pkgutil

__path__ = pkgutil.extend_path(__path__, __name__)  # type: ignore[name-defined]

_api_app = Path(__file__).resolve().parents[2] / "api" / "app"
_api_app_str = str(_api_app)
if _api_app_str not in __path__:
    __path__.append(_api_app_str)
