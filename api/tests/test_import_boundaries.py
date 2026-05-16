"""Phase 6 import boundary checks (lifecycle must not import orchestration)."""

from __future__ import annotations

import ast
import unittest
from pathlib import Path

from app.domains.boundaries import domain_for_module, imported_domain, is_import_allowed

API_ROOT = Path(__file__).resolve().parents[1] / "app"


def _python_files() -> list[Path]:
    out: list[Path] = []
    base = API_ROOT / "domains"
    if base.is_dir():
        out.extend(base.rglob("*.py"))
    return sorted(out)


def _imports_in_file(path: Path) -> list[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    mods: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                mods.append(alias.name)
        elif isinstance(node, ast.ImportFrom):
            if node.module:
                mods.append(node.module)
    return mods


class TestImportBoundaries(unittest.TestCase):
    def test_readiness_service_does_not_import_run_service(self) -> None:
        path = API_ROOT / "domains" / "lifecycle" / "readiness_service.py"
        mods = _imports_in_file(path)
        self.assertNotIn("app.domains.orchestration.run_service", mods)
        self.assertNotIn("app.services.run_service", mods)

    def test_domain_packages_respect_allowed_edges(self) -> None:
        violations: list[str] = []
        for path in _python_files():
            rel = path.relative_to(API_ROOT)
            module = "app." + ".".join(rel.with_suffix("").parts)
            owner = domain_for_module(module)
            if not owner:
                continue
            for imp in _imports_in_file(path):
                if not imp.startswith("app."):
                    continue
                target = imported_domain(imp)
                if not target or target == owner:
                    continue
                if not is_import_allowed(owner, target):
                    violations.append(f"{module} imports {imp} ({owner} -> {target})")
        self.assertEqual(violations, [], "\n".join(violations))


if __name__ == "__main__":
    unittest.main()
