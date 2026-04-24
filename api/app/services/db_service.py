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


def assert_db_connection() -> None:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT 1")
