#!/usr/bin/env python3
"""Replace hardcoded zinc utilities with semantic theme tokens (longest match first)."""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

SKIP = {
    "components/mlops/design-tokens-slide.tsx",
    "scripts/migrate-zinc-to-semantic.py",
}

# Order matters: longer patterns first
REPLACEMENTS = [
    ("bg-zinc-950/80", "bg-background/80"),
    ("bg-zinc-950/50", "bg-background/50"),
    ("bg-zinc-950/40", "bg-muted/30"),
    ("bg-zinc-950", "bg-background"),
    ("bg-zinc-900/50", "bg-card/80"),
    ("bg-zinc-900/30", "bg-muted/50"),
    ("bg-zinc-900", "bg-card"),
    ("bg-zinc-800/50", "bg-muted/80"),
    ("bg-zinc-800/30", "bg-muted/50"),
    ("bg-zinc-800", "bg-muted"),
    ("border-zinc-800/80", "border-border/80"),
    ("border-zinc-800/50", "border-border/50"),
    ("border-zinc-800", "border-border"),
    ("border-zinc-700", "border-border"),
    ("border-zinc-600", "border-border"),
    ("divide-zinc-800", "divide-border"),
    ("hover:bg-zinc-900/50", "hover:bg-accent/50"),
    ("hover:bg-zinc-900", "hover:bg-accent"),
    ("hover:bg-zinc-800/50", "hover:bg-accent/50"),
    ("hover:bg-zinc-800/30", "hover:bg-accent/50"),
    ("hover:bg-zinc-800", "hover:bg-accent"),
    ("hover:text-zinc-100", "hover:text-foreground"),
    ("hover:text-zinc-300", "hover:text-foreground"),
    ("hover:text-zinc-400", "hover:text-muted-foreground"),
    ("text-zinc-100", "text-foreground"),
    ("text-zinc-200", "text-foreground"),
    ("text-zinc-300", "text-foreground/90"),
    ("text-zinc-400", "text-muted-foreground"),
    ("text-zinc-500", "text-muted-foreground"),
    ("text-zinc-600", "text-muted-foreground/80"),
    ("placeholder:text-zinc-600", "placeholder:text-muted-foreground/70"),
    ("from-zinc-950", "from-background"),
    ("to-zinc-950", "to-background"),
    ("bg-zinc-950/60", "bg-muted/40"),
    ("bg-zinc-900/40", "bg-card/60"),
    ("bg-zinc-500/10", "bg-muted"),
    ("border-zinc-500/30", "border-border"),
    ("border-zinc-500/20", "border-border"),
    ("text-zinc-700", "text-muted-foreground"),
    ("bg-zinc-700", "bg-muted-foreground/60"),
    ("bg-zinc-600", "bg-muted-foreground/50"),
    ("!bg-zinc-600", "!bg-muted-foreground/50"),
    ("border-zinc-400/50", "border-border/60"),
    ("border-zinc-400/30", "border-border/40"),
    ("[&>button:hover]:!bg-zinc-700", "[&>button:hover]:!bg-accent"),
    ("hover:border-zinc-400/50", "hover:border-border/60"),
]


def should_process(path: Path) -> bool:
    rel = path.relative_to(ROOT).as_posix()
    if rel in SKIP:
        return False
    return path.suffix in {".tsx", ".ts"} and (
        rel.startswith("app/")
        or rel.startswith("components/")
        or rel.startswith("hooks/")
        or rel.startswith("lib/")
    )


def migrate_file(path: Path) -> bool:
    text = path.read_text()
    original = text
    for old, new in REPLACEMENTS:
        text = text.replace(old, new)
    if text != original:
        path.write_text(text)
        return True
    return False


def main() -> None:
    changed = []
    for path in sorted(ROOT.rglob("*")):
        if path.is_file() and should_process(path):
            if migrate_file(path):
                changed.append(path.relative_to(ROOT))
    print(f"Updated {len(changed)} files")
    for p in changed:
        print(f"  {p}")


if __name__ == "__main__":
    main()
