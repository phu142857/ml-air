# syntax=docker/dockerfile:1
# Build context: repository root (`.`).
#   docker build -f api/Dockerfile -t ml-air-api:latest .
ARG PYTHON_BASE_IMAGE=python:3.11-slim

FROM ${PYTHON_BASE_IMAGE} AS builder

WORKDIR /build

RUN if ! command -v gcc >/dev/null 2>&1; then \
      apt-get update && apt-get install -y --no-install-recommends build-essential gcc \
      && rm -rf /var/lib/apt/lists/*; \
    fi

COPY api/requirements.txt /build/requirements.txt

RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --upgrade pip setuptools wheel && \
    pip wheel --wheel-dir /wheels -r /build/requirements.txt

FROM python:3.11-slim AS runtime

ARG MLAIR_IMAGE_REF=
ARG MLAIR_SOURCE_COMMIT=
ARG MLAIR_SOURCE_BRANCH=

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    PYTHONPATH=/app \
    MLAIR_IMAGE_REF=${MLAIR_IMAGE_REF} \
    MLAIR_SOURCE_COMMIT=${MLAIR_SOURCE_COMMIT} \
    MLAIR_SOURCE_BRANCH=${MLAIR_SOURCE_BRANCH}

WORKDIR /app

COPY --from=builder /wheels /wheels

RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --no-cache-dir /wheels/* && rm -rf /wheels

COPY sdk /app/sdk
COPY api /app

RUN if [ -d "/app/builtin_reference_plugins" ]; then \
      pip install --no-cache-dir /app/builtin_reference_plugins; \
    fi

RUN useradd -m appuser && chown -R appuser:appuser /app \
    && mkdir -p /mlair/artifacts/datasets /mlair/artifacts/models \
    && chown -R appuser:appuser /mlair/artifacts

COPY api/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/health', timeout=3)"

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["sh", "-c", "alembic upgrade head && uvicorn main:app --host 0.0.0.0 --port 8080"]
