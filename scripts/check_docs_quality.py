#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
import re
import sys


DOCS_ROOT = Path("docs")
SCAN_GLOBS = [
    "index.md",
    "getting-started/**/*.md",
    "guides/**/*.md",
    "concepts/**/*.md",
    "cli/**/*.md",
    "api/**/*.md",
    "troubleshooting/**/*.md",
]
BLOCKED_PATTERNS = [
    re.compile(r"\bTODO\b", re.IGNORECASE),
    re.compile(r"\bTBD\b", re.IGNORECASE),
    re.compile(r"localhost:3000/docs", re.IGNORECASE),
]
TERMS = ["run", "task", "pipeline", "plugin", "lineage"]
TERMINOLOGY_WARN_GLOBS = (
    "docs/getting-started/",
    "docs/guides/",
    "docs/cli/",
    "docs/concepts/",
)
MIN_TERMS_PER_DOC = 2


def iter_docs() -> list[Path]:
    out: list[Path] = []
    for g in SCAN_GLOBS:
        out.extend(DOCS_ROOT.glob(g))
    return sorted({p for p in out if p.is_file()})


def main() -> int:
    docs = iter_docs()
    if not docs:
        print("[FAIL] no docs found in frozen structure")
        return 1

    failed = False
    for path in docs:
        text = path.read_text(encoding="utf-8")
        for pat in BLOCKED_PATTERNS:
            if pat.search(text):
                print(f"[FAIL] blocked pattern '{pat.pattern}' in {path}")
                failed = True
        lower = text.lower()
        in_scope = str(path).startswith(TERMINOLOGY_WARN_GLOBS)
        present_terms = [t for t in TERMS if t in lower]
        missing_terms = [t for t in TERMS if t not in lower]
        # Warn only for task-facing docs. A page is healthy when it mentions
        # at least two core terms to anchor user language consistently.
        if (
            in_scope
            and path.name not in {"index.md", "overview.md"}
            and len(present_terms) < MIN_TERMS_PER_DOC
        ):
            print(f"[WARN] terminology coverage in {path}: missing {', '.join(missing_terms)}")

    if failed:
        return 1
    print("[PASS] docs quality gate passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
