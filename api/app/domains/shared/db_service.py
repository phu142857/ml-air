import os
from contextlib import contextmanager
from typing import Iterator

from psycopg import Connection, connect


def _db_url() -> str:
    url = os.getenv("ML_AIR_DATABASE_URL", "postgresql://mlair:mlair@postgres:5432/mlair")
    if "client_encoding=" not in url:
        sep = "&" if "?" in url else "?"
        url = f"{url}{sep}client_encoding=utf8"
    return url


def database_url() -> str:
    """Public URL accessor for services that need their own connection settings (e.g. transactions)."""
    return _db_url()


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
