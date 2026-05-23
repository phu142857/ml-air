"""Runtime public URL resolution for /v1/runtime-config."""

from __future__ import annotations

import os
import unittest
from unittest.mock import patch

from starlette.requests import Request

from app.domains.platform.runtime_url_service import (
    resolve_runtime_api_base_url,
    resolve_runtime_realtime_base_url,
)


def _request(
    *,
    host: str = "alb.example.com",
    proto: str = "https",
    forwarded_host: str | None = None,
) -> Request:
    headers: list[tuple[bytes, bytes]] = [
        (b"host", host.encode()),
        (b"x-forwarded-proto", proto.encode()),
    ]
    if forwarded_host:
        headers.append((b"x-forwarded-host", forwarded_host.encode()))
    scope = {
        "type": "http",
        "method": "GET",
        "path": "/v1/runtime-config",
        "headers": headers,
        "query_string": b"",
        "client": ("127.0.0.1", 12345),
        "server": (host, 443),
        "scheme": proto,
    }
    return Request(scope)


class TestRuntimeUrlService(unittest.TestCase):
    def test_explicit_env_wins(self) -> None:
        with patch.dict(os.environ, {"ML_AIR_RUNTIME_API_BASE_URL": "https://explicit.example"}, clear=False):
            self.assertEqual(
                resolve_runtime_api_base_url(_request()),
                "https://explicit.example",
            )

    def test_infer_from_forwarded_headers(self) -> None:
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop("ML_AIR_RUNTIME_API_BASE_URL", None)
            out = resolve_runtime_api_base_url(
                _request(host="internal", forwarded_host="my-alb.us-east-1.elb.amazonaws.com", proto="https")
            )
        self.assertEqual(out, "https://my-alb.us-east-1.elb.amazonaws.com")

    def test_realtime_from_api_base_not_localhost_default(self) -> None:
        with patch.dict(os.environ, {}, clear=False):
            for key in (
                "ML_AIR_RUNTIME_REALTIME_BASE_URL",
                "ML_AIR_RUNTIME_REALTIME_DEFAULT_URL",
            ):
                os.environ.pop(key, None)
            ws = resolve_runtime_realtime_base_url(
                _request(proto="https"),
                api_base_url="https://alb.example.com",
            )
        self.assertEqual(ws, "wss://alb.example.com")


if __name__ == "__main__":
    unittest.main()
