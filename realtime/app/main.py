from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import os
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Query, WebSocket, WebSocketDisconnect
from prometheus_client import start_http_server
from redis import asyncio as redis_asyncio
from starlette.websockets import WebSocketState

from app.auth_ws import authorize_ws, decode_principal
from app.coalesce import RealtimeCoalescer
from app.metrics import (
    EVENTS_DROPPED_BACKPRESSURE,
    EVENTS_RECEIVED,
    EVENTS_WS_SEND_ERR,
    EVENTS_WS_SEND_OK,
    WS_ACTIVE,
)

from app.otel_api import init_realtime_otel

logging.basicConfig(
    level=os.getenv("ML_AIR_LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("mlair.realtime")

REDIS_URL = os.getenv("ML_AIR_REDIS_URL", "redis://localhost:6379/0")
PING_INTERVAL = float(os.getenv("MLAIR_REALTIME_PING_SECONDS", "30"))
MAX_PENDING_SENDS = max(1, int(os.getenv("MLAIR_REALTIME_MAX_PENDING_SENDS", "64")))
METRICS_PORT = int(os.getenv("ML_AIR_REALTIME_METRICS_PORT", "9104"))
COALESCE_MS = float(os.getenv("MLAIR_REALTIME_COALESCE_MS", "150"))
STREAM_FANOUT = os.getenv("MLAIR_REALTIME_STREAM_FANOUT", "1").strip() == "1"
GLOBAL_STREAM_KEY = "mlair.events.durable"
STREAM_BLOCK_MS = max(100, int(os.getenv("MLAIR_REALTIME_STREAM_BLOCK_MS", "1000")))


class ConnectionManager:
    def __init__(self) -> None:
        self._buckets: dict[str, set[WebSocket]] = {}
        self._send_depth: dict[int, int] = {}
        self._lock = asyncio.Lock()
        self._max_pending = MAX_PENDING_SENDS

    async def add(self, key: str, ws: WebSocket) -> None:
        async with self._lock:
            self._buckets.setdefault(key, set()).add(ws)
            self._send_depth.setdefault(id(ws), 0)

    async def remove(self, key: str, ws: WebSocket) -> None:
        wid = id(ws)
        async with self._lock:
            self._send_depth.pop(wid, None)
            b = self._buckets.get(key)
            if not b:
                return
            b.discard(ws)
            if not b:
                del self._buckets[key]

    async def snapshot_bucket(self, key: str) -> list[WebSocket]:
        async with self._lock:
            return list(self._buckets.get(key, ()))

    async def close_all(self) -> None:
        async with self._lock:
            all_ws = [ws for bucket in self._buckets.values() for ws in bucket]
            self._buckets.clear()
            self._send_depth.clear()
        for ws in all_ws:
            with contextlib.suppress(Exception):
                await ws.close(code=1001)

    async def fanout_json(self, key: str, event: dict[str, Any]) -> None:
        logger.info(
            "[event] trace_id=%s type=%s tenant=%s project=%s resource=%s",
            event.get("trace_id"),
            event.get("type"),
            event.get("tenant_id"),
            event.get("project_id"),
            event.get("resource_id"),
        )
        EVENTS_RECEIVED.inc()
        targets = await self.snapshot_bucket(key)
        for ws in targets:
            await self._send_one(key, ws, event)

    async def _send_one(self, key: str, ws: WebSocket, event: dict[str, Any]) -> None:
        wid = id(ws)
        async with self._lock:
            d = self._send_depth.get(wid, 0)
            if d >= self._max_pending:
                EVENTS_DROPPED_BACKPRESSURE.inc()
                logger.warning(
                    "[event] dropped_backpressure ws_id=%s key=%s trace_id=%s type=%s depth=%s",
                    wid,
                    key,
                    event.get("trace_id"),
                    event.get("type"),
                    d,
                )
                return
            self._send_depth[wid] = d + 1

        removed_dead = False
        try:
            await ws.send_json(event)
            EVENTS_WS_SEND_OK.inc()
        except Exception:
            EVENTS_WS_SEND_ERR.inc()
            await self.remove(key, ws)
            removed_dead = True
        finally:
            if not removed_dead:
                async with self._lock:
                    cur = self._send_depth.get(wid, 1)
                    nxt = max(0, cur - 1)
                    if nxt == 0:
                        self._send_depth.pop(wid, None)
                    else:
                        self._send_depth[wid] = nxt


async def _ws_ping_loop(ws: WebSocket) -> None:
    while True:
        await asyncio.sleep(PING_INTERVAL)
        try:
            if ws.client_state != WebSocketState.CONNECTED:
                return
            await ws.send_json({"type": "ping", "ts": time.time()})
        except Exception:
            return


async def _stream_fanout_listener(coalescer: RealtimeCoalescer, r: redis_asyncio.Redis) -> None:
    """Optional durable-bus consumer: XREAD global stream → same coalesced WS fan-out as pub/sub."""
    last_id = os.getenv("MLAIR_REALTIME_STREAM_START_ID", "$").strip() or "$"
    logger.info("realtime_stream_fanout_started stream=%s start_id=%s", GLOBAL_STREAM_KEY, last_id)
    try:
        while True:
            try:
                batches = await r.xread({GLOBAL_STREAM_KEY: last_id}, block=STREAM_BLOCK_MS, count=64)
            except Exception as exc:  # noqa: BLE001
                logger.warning("stream_fanout_xread_failed err=%s", exc)
                await asyncio.sleep(1.0)
                continue
            if not batches:
                continue
            for _stream_name, entries in batches:
                for entry_id, field_map in entries:
                    last_id = entry_id
                    raw_env = field_map.get("envelope")
                    if not raw_env:
                        continue
                    try:
                        event: dict[str, Any] = json.loads(raw_env)
                    except json.JSONDecodeError:
                        continue
                    tid = str(event.get("tenant_id") or field_map.get("tenant_id") or "").strip()
                    pid = str(event.get("project_id") or field_map.get("project_id") or "").strip()
                    if not tid or not pid:
                        continue
                    event.setdefault("tenant_id", tid)
                    event.setdefault("project_id", pid)
                    await coalescer.push(event)
    except asyncio.CancelledError:
        raise
    except Exception as exc:  # noqa: BLE001
        logger.exception("stream_fanout_listener_stopped err=%s", exc)


async def _redis_listener(coalescer: RealtimeCoalescer, r: redis_asyncio.Redis) -> None:
    pubsub = r.pubsub()
    await pubsub.psubscribe("mlair.events.*")
    try:
        while True:
            msg = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
            if msg is None:
                continue
            mtype = msg.get("type")
            if mtype not in {"pmessage", "message"}:
                continue
            raw = msg.get("data")
            if not isinstance(raw, str):
                continue
            try:
                event: dict[str, Any] = json.loads(raw)
            except json.JSONDecodeError:
                continue
            tid = str(event.get("tenant_id") or "").strip()
            pid = str(event.get("project_id") or "").strip()
            if not tid or not pid:
                continue
            await coalescer.push(event)
    except asyncio.CancelledError:
        raise
    except Exception as exc:  # noqa: BLE001
        logger.exception("redis_listener_stopped err=%s", exc)
    finally:
        with contextlib.suppress(Exception):
            await pubsub.punsubscribe()
        with contextlib.suppress(Exception):
            await pubsub.aclose()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    try:
        start_http_server(METRICS_PORT)
    except OSError as exc:
        logger.warning("realtime_metrics_listen_failed port=%s err=%s", METRICS_PORT, exc)

    r = redis_asyncio.from_url(REDIS_URL, decode_responses=True)
    manager = ConnectionManager()

    async def _emit_coalesced(ev: dict[str, Any]) -> None:
        tid = str(ev.get("tenant_id") or "").strip()
        pid = str(ev.get("project_id") or "").strip()
        if not tid or not pid:
            return
        await manager.fanout_json(f"{tid}:{pid}", ev)

    coalescer = RealtimeCoalescer(COALESCE_MS, _emit_coalesced)
    app.state.manager = manager
    app.state.coalescer = coalescer
    app.state.redis = r
    listener = asyncio.create_task(_redis_listener(coalescer, r))
    stream_listener: asyncio.Task[None] | None = None
    if STREAM_FANOUT:
        stream_listener = asyncio.create_task(_stream_fanout_listener(coalescer, r))
    logger.info(
        "realtime_started redis=%s metrics_port=%s max_pending_sends=%s coalesce_ms=%s stream_fanout=%s",
        REDIS_URL.split("@")[-1],
        METRICS_PORT,
        MAX_PENDING_SENDS,
        COALESCE_MS,
        STREAM_FANOUT,
    )
    try:
        yield
    finally:
        listener.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await listener
        if stream_listener is not None:
            stream_listener.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await stream_listener
        await coalescer.shutdown()
        await manager.close_all()
        await r.aclose()
        logger.info("realtime_shutdown_complete")


app = FastAPI(title="MLAir Realtime", lifespan=lifespan)


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    tenant_id: str = Query(..., min_length=1),
    project_id: str = Query(..., min_length=1),
    token: str = Query(..., min_length=1),
) -> None:
    principal = await asyncio.to_thread(decode_principal, token)
    if not principal or not authorize_ws(principal, tenant_id, project_id, "viewer"):
        await websocket.close(code=1008)
        logger.warning("ws_auth_fail reason=tenant_mismatch|project_invalid|jwt_invalid tenant_id=%s", tenant_id)
        return

    await websocket.accept()

    manager: ConnectionManager = websocket.app.state.manager
    key = f"{tenant_id}:{project_id}"
    await manager.add(key, websocket)
    WS_ACTIVE.inc()
    ping_task = asyncio.create_task(_ws_ping_loop(websocket))
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        ping_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await ping_task
        await manager.remove(key, websocket)
        WS_ACTIVE.dec()


init_realtime_otel(app)
