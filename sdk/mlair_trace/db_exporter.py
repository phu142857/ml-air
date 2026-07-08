"""OpenTelemetry SpanExporter → MLAir Postgres span store."""

from __future__ import annotations

import logging
from typing import Sequence

from opentelemetry.sdk.trace import ReadableSpan
from opentelemetry.sdk.trace.export import SpanExporter, SpanExportResult

from sdk.mlair_trace.store import persist_readable_spans

logger = logging.getLogger("mlair.otel.db_exporter")


class DbSpanExporter(SpanExporter):
    def export(self, spans: Sequence[ReadableSpan]) -> SpanExportResult:
        if not spans:
            return SpanExportResult.SUCCESS
        try:
            persist_readable_spans(spans)
            return SpanExportResult.SUCCESS
        except Exception as exc:  # noqa: BLE001
            logger.debug("db_span_export_failed count=%s err=%s", len(spans), exc)
            return SpanExportResult.FAILURE

    def shutdown(self) -> None:
        return None

    def force_flush(self, timeout_millis: int = 30000) -> bool:
        return True
