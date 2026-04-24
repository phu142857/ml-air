import os
from contextlib import contextmanager
from typing import Iterator

from psycopg import Connection, connect


def _db_url() -> str:
    return os.getenv("ML_AIR_DATABASE_URL", "postgresql://mlair:mlair@postgres:5432/mlair")


@contextmanager
def db_conn() -> Iterator[Connection]:
    conn = connect(_db_url(), autocommit=True)
    try:
        yield conn
    finally:
        conn.close()


def init_db() -> None:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS runs (
                    run_id TEXT PRIMARY KEY,
                    tenant_id TEXT NOT NULL,
                    project_id TEXT NOT NULL,
                    pipeline_id TEXT NOT NULL,
                    status TEXT NOT NULL,
                    idempotency_key TEXT,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
                """
            )
            cur.execute(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS uq_runs_idempotency
                ON runs (tenant_id, project_id, idempotency_key)
                WHERE idempotency_key IS NOT NULL;
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS tasks (
                    task_id TEXT PRIMARY KEY,
                    run_id TEXT NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
                    status TEXT NOT NULL,
                    attempt INTEGER NOT NULL DEFAULT 1,
                    max_attempts INTEGER NOT NULL DEFAULT 3,
                    backoff_ms INTEGER NOT NULL DEFAULT 1000,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
                """
            )
