from contextvars import ContextVar
from uuid import uuid4

_trace_id_ctx: ContextVar[str] = ContextVar("mlair_trace_id", default="")


def normalize_trace_id(trace_id: str | None) -> str:
    value = (trace_id or "").strip()
    if not value:
        return str(uuid4())
    return value[:128]


def set_trace_id(trace_id: str) -> None:
    _trace_id_ctx.set(trace_id)


def get_trace_id() -> str:
    current = _trace_id_ctx.get()
    if current:
        return current
    generated = str(uuid4())
    _trace_id_ctx.set(generated)
    return generated
