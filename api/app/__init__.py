# Package marker for api app.
from __future__ import annotations

from pathlib import Path

import pkgutil

__path__ = pkgutil.extend_path(__path__, __name__)  # type: ignore[name-defined]

_rt_app = Path(__file__).resolve().parents[2] / "realtime" / "app"
_rt_app_str = str(_rt_app)
if _rt_app_str not in __path__:
    __path__.append(_rt_app_str)
