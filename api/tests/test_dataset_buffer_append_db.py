from __future__ import annotations

import os
import tempfile
import unittest
from uuid import uuid4

from psycopg import connect

from app.domains.shared.db_service import database_url
from app.domains.lifecycle import lineage_service


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
class TestDatasetBufferAppendDB(unittest.TestCase):
    def setUp(self) -> None:
        self.tenant_id = f"it_tenant_{uuid4().hex[:8]}"
        self.project_id = f"it_project_{uuid4().hex[:8]}"
        self.dataset_name = f"it_dataset_{uuid4().hex[:8]}"
        self.dataset_id = lineage_service._upsert_dataset(  # type: ignore[attr-defined]
            tenant_id=self.tenant_id,
            project_id=self.project_id,
            name=self.dataset_name,
            source_uri=None,
            checksum=None,
            current_size=0,
        )
        # Ensure a buffer exists and auto-materializes at >= 3.
        lineage_service._upsert_dataset_buffer(  # type: ignore[attr-defined]
            tenant_id=self.tenant_id,
            project_id=self.project_id,
            dataset_id=self.dataset_id,
            source_type="runtime_manifest",
            current_size=0,
            target_threshold=3,
            accumulation_strategy="snapshot_on_threshold",
            window_status="active",
        )
        self.tmpdir = tempfile.TemporaryDirectory()
        self._old_root = os.environ.get("ML_AIR_DATASET_ARTIFACT_ROOT")
        os.environ["ML_AIR_DATASET_ARTIFACT_ROOT"] = f"file://{self.tmpdir.name}"

    def tearDown(self) -> None:
        if self._old_root is None:
            os.environ.pop("ML_AIR_DATASET_ARTIFACT_ROOT", None)
        else:
            os.environ["ML_AIR_DATASET_ARTIFACT_ROOT"] = self._old_root
        self.tmpdir.cleanup()
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

    def test_append_materializes_at_threshold(self) -> None:
        out1 = lineage_service.append_dataset_buffer_rows(
            tenant_id=self.tenant_id,
            project_id=self.project_id,
            dataset_id=self.dataset_id,
            rows=[{"image_uri": "s3://x/1.jpg"}],
            source_type="runtime_manifest",
            execution_id="exec-1",
        )
        self.assertEqual(out1["appended_rows"], 1)
        self.assertEqual(out1["current_size"], 1)
        self.assertFalse(out1["materialized"])

        out2 = lineage_service.append_dataset_buffer_rows(
            tenant_id=self.tenant_id,
            project_id=self.project_id,
            dataset_id=self.dataset_id,
            rows=[{"image_uri": "s3://x/2.jpg"}, {"image_uri": "s3://x/3.jpg"}],
            source_type="runtime_manifest",
            execution_id="exec-2",
        )
        self.assertEqual(out2["appended_rows"], 2)
        self.assertEqual(out2["current_size"], 3)
        self.assertTrue(out2["materialized"])
        self.assertTrue(str(out2.get("dataset_version_id") or "").strip())


if __name__ == "__main__":
    unittest.main()

