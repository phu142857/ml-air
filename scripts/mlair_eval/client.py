"""Timed HTTP client for the evaluation harness."""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class TimedCall:
    latency_ms: float
    status_code: int
    body: dict[str, Any]
    ok: bool


class EvalClient:
    def __init__(self, base_url: str, token: str, timeout: float = 30.0) -> None:
        self.base = base_url.rstrip("/")
        self.token = token
        self.timeout = timeout

    def request(
        self,
        method: str,
        path: str,
        body: dict[str, Any] | None = None,
        *,
        timeout: float | None = None,
    ) -> TimedCall:
        headers = {"Authorization": f"Bearer {self.token}"}
        data = None
        if body is not None:
            headers["Content-Type"] = "application/json"
            data = json.dumps(body).encode("utf-8")
        url = path if path.startswith("http") else f"{self.base}{path}"
        req = urllib.request.Request(url=url, method=method, headers=headers, data=data)
        started = time.perf_counter()
        try:
            with urllib.request.urlopen(req, timeout=timeout or self.timeout) as resp:
                raw = resp.read().decode("utf-8")
                payload = json.loads(raw or "{}") if raw.strip().startswith("{") or raw.strip().startswith("[") else {"raw": raw}
                code = int(resp.getcode() or 0)
                ok = 200 <= code < 400
        except urllib.error.HTTPError as exc:
            raw = exc.read().decode("utf-8", errors="replace")
            try:
                payload = json.loads(raw or "{}")
            except json.JSONDecodeError:
                payload = {"raw": raw}
            code = int(exc.code)
            ok = False
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            payload = {"error": str(exc)}
            code = 0
            ok = False
        latency_ms = (time.perf_counter() - started) * 1000.0
        if not isinstance(payload, dict):
            payload = {"value": payload}
        return TimedCall(latency_ms=latency_ms, status_code=code, body=payload, ok=ok)

    def multipart_upload(self, path: str, fields: dict[str, str], file_bytes: bytes, filename: str = "data.csv") -> TimedCall:
        import uuid

        boundary = f"----mlairEval{uuid.uuid4().hex}"
        crlf = b"\r\n"
        parts: list[bytes] = []
        for key, value in fields.items():
            parts.extend(
                [
                    f"--{boundary}".encode("ascii"),
                    crlf,
                    f'Content-Disposition: form-data; name="{key}"'.encode("ascii"),
                    crlf,
                    crlf,
                    str(value).encode("utf-8"),
                    crlf,
                ]
            )
        parts.extend(
            [
                f"--{boundary}".encode("ascii"),
                crlf,
                f'Content-Disposition: form-data; name="file"; filename="{filename}"'.encode("ascii"),
                crlf,
                b"Content-Type: text/csv",
                crlf,
                crlf,
                file_bytes,
                crlf,
                f"--{boundary}--".encode("ascii"),
                crlf,
            ]
        )
        headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        }
        req = urllib.request.Request(url=f"{self.base}{path}", method="POST", headers=headers, data=b"".join(parts))
        started = time.perf_counter()
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                payload = json.loads(resp.read().decode("utf-8") or "{}")
                code = int(resp.getcode() or 0)
                ok = 200 <= code < 400
        except urllib.error.HTTPError as exc:
            raw = exc.read().decode("utf-8", errors="replace")
            try:
                payload = json.loads(raw or "{}")
            except json.JSONDecodeError:
                payload = {"raw": raw}
            code = int(exc.code)
            ok = False
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            payload = {"error": str(exc)}
            code = 0
            ok = False
        return TimedCall(
            latency_ms=(time.perf_counter() - started) * 1000.0,
            status_code=code,
            body=payload if isinstance(payload, dict) else {"value": payload},
            ok=ok,
        )
