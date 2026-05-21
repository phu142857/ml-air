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
class TestDatasetDeleteDB(unittest.TestCase):
    def setUp(self) -> None:
        self.tenant_id = f"it_tenant_{uuid4().hex[:8]}"
        self.project_id = f"it_project_{uuid4().hex[:8]}"
        self.dataset_name = f"it_delete_{uuid4().hex[:8]}"
        self.tmpdir = tempfile.TemporaryDirectory()
        self._old_root = os.environ.get("ML_AIR_DATASET_ARTIFACT_ROOT")
        os.environ["ML_AIR_DATASET_ARTIFACT_ROOT"] = f"file://{self.tmpdir.name}"

    def tearDown(self) -> None:
        if self._old_root is None:
            os.environ.pop("ML_AIR_DATASET_ARTIFACT_ROOT", None)
        else:
            os.environ["ML_AIR_DATASET_ARTIFACT_ROOT"] = self._old_root
        self.tmpdir.cleanup()

    def test_delete_version_then_dataset_by_name(self) -> None:
        upload = lineage_service.create_dataset_version_from_csv_upload(
            tenant_id=self.tenant_id,
            project_id=self.project_id,
            dataset_name=self.dataset_name,
            csv_bytes=b"pet_id,animal_type\n1,Dog\n",
            source_filename="tiny.csv",
            required_cols=["pet_id", "animal_type"],
        )
        dataset_id = str(upload["dataset_id"])
        version_id = str(upload["version_id"])
        ver = lineage_service.get_dataset_version(self.tenant_id, self.project_id, version_id)
        self.assertIsNotNone(ver)
        uri = str(ver.get("uri") or "")
        self.assertTrue(uri.startswith("file://"))

        self.assertTrue(
            lineage_service.delete_dataset_version(self.tenant_id, self.project_id, dataset_id, version_id)
        )
        self.assertIsNone(lineage_service.get_dataset_version(self.tenant_id, self.project_id, version_id))

        ok, deleted_id = lineage_service.delete_dataset_by_name(
            self.tenant_id, self.project_id, self.dataset_name
        )
        self.assertTrue(ok)
        self.assertEqual(deleted_id, dataset_id)
        self.assertIsNone(lineage_service.get_dataset(self.tenant_id, self.project_id, dataset_id))


if __name__ == "__main__":
    unittest.main()
