from __future__ import annotations

from prometheus_client import Counter, Gauge

EVENTS_RECEIVED = Counter(
    "mlair_realtime_redis_events_received_total",
    "Pub/Sub messages parsed as MLAir realtime envelopes",
)
EVENTS_WS_SEND_OK = Counter(
    "mlair_realtime_ws_send_ok_total",
    "Successful WebSocket JSON sends",
)
EVENTS_WS_SEND_ERR = Counter(
    "mlair_realtime_ws_send_errors_total",
    "WebSocket send failures (socket removed)",
)
EVENTS_DROPPED_BACKPRESSURE = Counter(
    "mlair_realtime_events_dropped_total",
    "Events skipped for a socket due to max pending sends",
)
EVENTS_COALESCED = Counter(
    "mlair_realtime_events_coalesced_total",
    "Superseded events merged in the pre-fan-out debounce buffer",
)
WS_ACTIVE = Gauge("mlair_realtime_ws_active_connections", "Accepted WebSocket connections")
