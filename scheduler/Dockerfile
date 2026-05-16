# syntax=docker/dockerfile:1
# Build context: repository root (`.`).
ARG PYTHON_BASE_IMAGE=python:3.11-slim

FROM ${PYTHON_BASE_IMAGE} AS builder

WORKDIR /build

RUN if ! command -v gcc >/dev/null 2>&1; then \
      apt-get update && apt-get install -y --no-install-recommends build-essential gcc \
      && rm -rf /var/lib/apt/lists/*; \
    fi

COPY scheduler/requirements.txt /build/requirements.txt

RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --upgrade pip setuptools wheel && \
    pip wheel --wheel-dir /wheels -r /build/requirements.txt

FROM python:3.11-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    PYTHONPATH=/app

WORKDIR /app

COPY --from=builder /wheels /wheels

RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --no-cache-dir /wheels/* && rm -rf /wheels

COPY sdk /app/sdk
COPY scheduler /app/scheduler

WORKDIR /app/scheduler

RUN useradd -m appuser && chown -R appuser:appuser /app

USER appuser

CMD ["python", "main.py"]
