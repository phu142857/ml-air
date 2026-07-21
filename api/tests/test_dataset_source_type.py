from __future__ import annotations

import unittest

from app.dataset_source_type import canonical_dataset_source_type


class TestDatasetSourceType(unittest.TestCase):
    def test_csv_import(self) -> None:
        self.assertEqual(canonical_dataset_source_type("csv_import"), "import")

    def test_runtime_feedback(self) -> None:
        self.assertEqual(canonical_dataset_source_type("runtime_feedback"), "runtime_accumulated")

    def test_unknown_literal(self) -> None:
        self.assertEqual(canonical_dataset_source_type("vendor_x"), "unknown")


if __name__ == "__main__":
    unittest.main()
