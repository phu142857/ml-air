"""Debounce + merge duplicate realtime events before WebSocket fan-out (startUpForRTS §4.7)."""

from __future__ import annotations

import asyncio
import contextlib
from collections.abc import Awaitable, Callable
from typing import Any

from app.metrics import EVENTS_COALESCED


def merge_key(event: dict[str, Any]) -> str | None:
    tid = str(event.get("tenant_id") or "").strip()
    pid = str(event.get("project_id") or "").strip()
    if not tid or not pid:
        return None
    typ = str(event.get("type") or "")
    res = event.get("resource_id")
    return f"{tid}:{pid}:{typ}:{res!s}"


class RealtimeCoalescer:
    """
    Per (tenant, project, type, resource_id) keep the latest envelope; flush once
    after `flush_ms` of quiet time (debounce). Ping/control messages bypass (no merge key).
    """

    def __init__(self, flush_ms: float, on_emit: Callable[[dict[str, Any]], Awaitable[None]]) -> None:
        self._flush_ms = max(50.0, float(flush_ms)) / 1000.0
        self._on_emit = on_emit
        self._lock = asyncio.Lock()
        self._buf: dict[str, dict[str, Any]] = {}
        self._timer: asyncio.Task[None] | None = None

    async def push(self, event: dict[str, Any]) -> None:
        mk = merge_key(event)
        if mk is None:
            await self._on_emit(event)
            return
        old_timer: asyncio.Task[None] | None = None
        async with self._lock:
            if mk in self._buf:
                EVENTS_COALESCED.inc()
            self._buf[mk] = event
            old_timer = self._timer
            self._timer = asyncio.create_task(self._flush_after_delay())
        if old_timer and not old_timer.done():
            old_timer.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await old_timer

    async def _flush_after_delay(self) -> None:
        items: list[dict[str, Any]] = []
        try:
            await asyncio.sleep(self._flush_ms)
            async with self._lock:
                items = list(self._buf.values())
                self._buf.clear()
                self._timer = None
        except asyncio.CancelledError:
            return
        for ev in items:
            with contextlib.suppress(Exception):
                await self._on_emit(ev)

    async def shutdown(self) -> None:
        async with self._lock:
            t = self._timer
            self._timer = None
            items = list(self._buf.values())
            self._buf.clear()
        if t and not t.done():
            t.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await t
        for ev in items:
            with contextlib.suppress(Exception):
                await self._on_emit(ev)
