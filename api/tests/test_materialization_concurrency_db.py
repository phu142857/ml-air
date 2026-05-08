from __future__ import annotations

import os
import threading
import unittest
from uuid import uuid4

from psycopg import connect

from app.services.db_service import database_url
from app.services import lineage_service


def _db_ready() -> bool:
    try:
        with connect(database_url(), autocommit=True) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
                cur.fetchone()
        return True
    except Exception:
        return False


@unittest.skipUnless(
    os.getenv("ML_AIR_RUN_DB_INTEGRATION_TESTS", "0") == "1",
    "set ML_AIR_RUN_DB_INTEGRATION_TESTS=1 to run DB integration tests",
)
@unittest.skipUnless(_db_ready(), "database not reachable for integration tests")
class TestMaterializationConcurrencyDB(unittest.TestCase):
    def setUp(self) -> None:
        self.tenant_id = f"it_tenant_{uuid4().hex[:8]}"
        self.project_id = f"it_project_{uuid4().hex[:8]}"
        self.dataset_name = f"it_dataset_{uuid4().hex[:8]}"
        self.dataset_id = lineage_service._upsert_dataset(  # type: ignore[attr-defined]
            tenant_id=self.tenant_id,
            project_id=self.project_id,
            name=self.dataset_name,
            source_uri=None,
            checksum="it-checksum",
            current_size=1200,
        )
        # Snapshot-on-threshold strategy should auto-materialize at >= threshold.
        lineage_service._upsert_dataset_buffer(  # type: ignore[attr-defined]
            tenant_id=self.tenant_id,
            project_id=self.project_id,
            dataset_id=self.dataset_id,
            source_type="runtime_feedback",
            current_size=1200,
            target_threshold=1000,
            accumulation_strategy="snapshot_on_threshold",
            window_status="active",
        )

    def tearDown(self) -> None:
        with connect(database_url(), autocommit=True) as conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM dataset_versions WHERE dataset_id = %s", (self.dataset_id,))
                cur.execute(
                    """
                    DELETE FROM dataset_accumulation_buffers
                    WHERE tenant_id = %s AND project_id = %s AND dataset_id = %s
                    """,
                    (self.tenant_id, self.project_id, self.dataset_id),
                )
                cur.execute(
                    """
                    DELETE FROM datasets
                    WHERE tenant_id = %s AND project_id = %s AND dataset_id = %s
                    """,
                    (self.tenant_id, self.project_id, self.dataset_id),
                )

    def test_concurrent_materialization_creates_single_version(self) -> None:
        results: list[tuple[str | None, str | None]] = []
        errors: list[str] = []
        lock = threading.Lock()

        def worker() -> None:
            try:
                out = lineage_service._materialize_runtime_feedback_if_needed(  # type: ignore[attr-defined]
                    tenant_id=self.tenant_id,
                    project_id=self.project_id,
                    dataset_id=self.dataset_id,
                    source_type="runtime_feedback",
                    uri=None,
                    checksum="it-checksum",
                    size=1200,
                    force=False,
                )
                with lock:
                    results.append(out)
            except Exception as exc:  # noqa: BLE001
                with lock:
                    errors.append(str(exc))

        threads = [threading.Thread(target=worker) for _ in range(8)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        self.assertEqual(errors, [], f"unexpected worker errors: {errors}")

        with connect(database_url(), autocommit=True) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT COUNT(*) FROM dataset_versions WHERE dataset_id = %s", (self.dataset_id,))
                count = int(cur.fetchone()[0] or 0)
                self.assertEqual(count, 1, "should materialize exactly one dataset version under race")

                cur.execute(
                    """
                    SELECT current_size, last_materialized_version_id
                    FROM dataset_accumulation_buffers
                    WHERE tenant_id = %s AND project_id = %s AND dataset_id = %s
                    """,
                    (self.tenant_id, self.project_id, self.dataset_id),
                )
                row = cur.fetchone()
                self.assertIsNotNone(row)
                self.assertEqual(int(row[0] or -1), 0, "buffer should reset after materialization")
                self.assertTrue(str(row[1] or "").strip(), "buffer should store last_materialized_version_id")

        # At least one thread should get the created version tuple.
        self.assertTrue(any(r[0] and r[1] for r in results), "expected at least one successful materialization result")


if __name__ == "__main__":
    unittest.main()
