"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

type Entry = { id: string; label: string; hint: string; href: string; keywords?: string };

/** Same order as Workspace sidebar (Dashboard → … → Settings), then Search. */
const NAV: Entry[] = [
  { id: "dashboard", label: "Dashboard", hint: "Ops snapshot", href: "/dashboard", keywords: "overview" },
  { id: "pipelines", label: "Pipelines", hint: "DAG · replay · advanced gate", href: "/pipelines", keywords: "orchestration dag" },
  { id: "runs", label: "Runs", hint: "Operational list", href: "/runs", keywords: "execution" },
  { id: "lineage", label: "Lineage", hint: "Debug graph", href: "/lineage", keywords: "graph" },
  { id: "models", label: "Models", hint: "Governance · policies · serving", href: "/models", keywords: "approval" },
  { id: "datasets", label: "Dataset Hub", hint: "Lifecycle · versions · readiness · train", href: "/datasets", keywords: "csv upload hub version" },
  { id: "lifecycle", label: "Lifecycle insights", hint: "Hub links · semantic ops", href: "/lifecycle", keywords: "readiness materialization train" },
  { id: "tasks", label: "Tasks", hint: "Task list", href: "/tasks", keywords: "worker" },
  { id: "settings", label: "Settings", hint: "Scope & preferences", href: "/settings", keywords: "tenant project" },
  { id: "search", label: "Search", hint: "Runs, tasks, datasets…", href: "/search", keywords: "find" }
];

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return NAV;
    return NAV.filter(
      (e) =>
        e.label.toLowerCase().includes(s) ||
        e.hint.toLowerCase().includes(s) ||
        (e.keywords && e.keywords.includes(s))
    );
  }, [q]);

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      setQ("");
      setActiveIndex(0);
      router.push(href);
    },
    [router]
  );

  useEffect(() => {
    setActiveIndex(0);
  }, [q, open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (!open) return;
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        return;
      }
      const max = Math.max(0, filtered.length - 1);
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, max));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(0, i - 1));
        return;
      }
      if (e.key === "Enter") {
        const idx = Math.min(activeIndex, max);
        const item = filtered[idx];
        if (item) {
          e.preventDefault();
          go(item.href);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, filtered, activeIndex, go]);

  useEffect(() => {
    if (!open || !filtered.length) return;
    const idx = Math.min(activeIndex, filtered.length - 1);
    itemRefs.current[idx]?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex, filtered.length]);

  if (!open) return null;

  const maxIdx = Math.max(0, filtered.length - 1);
  const safeIndex = Math.min(activeIndex, maxIdx);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/55 px-4 pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-xl border border-border bg-card shadow-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border px-3 py-2">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Go to…"
            className="w-full rounded-md border border-transparent bg-muted px-3 py-2 text-sm text-foreground outline-none ring-0 placeholder:text-muted-foreground focus:border-border"
          />
          <p className="mt-1 text-overline text-muted-foreground">
            ↑ ↓ move · Enter open · Esc close · ⌘/Ctrl+K toggle
          </p>
        </div>
        <ul className="max-h-[min(50vh,360px)] overflow-y-auto py-1" role="listbox" aria-activedescendant={filtered[safeIndex]?.id}>
          {filtered.length === 0 ? (
            <li className="px-4 py-6 text-center text-caption text-muted-foreground">No matches</li>
          ) : (
            filtered.map((e, i) => (
              <li key={e.id} role="presentation">
                <button
                  ref={(node) => {
                    itemRefs.current[i] = node;
                  }}
                  id={e.id}
                  type="button"
                  role="option"
                  aria-selected={i === safeIndex}
                  className={cn(
                    "flex w-full flex-col items-start gap-0.5 px-4 py-2.5 text-left text-body transition-colors",
                    "focus:outline-none",
                    i === safeIndex ? "bg-muted text-foreground" : "hover:bg-muted/80 text-foreground"
                  )}
                  onClick={() => go(e.href)}
                  onMouseEnter={() => setActiveIndex(i)}
                >
                  <span className="font-medium">{e.label}</span>
                  <span className="text-caption text-muted-foreground">{e.hint}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
