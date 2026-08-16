"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Copy, Search } from "lucide-react";

import { HighlightText } from "@/components/mlops/trace-explorer/highlight-text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { copyWithToast } from "@/lib/toast-actions";
import { cn } from "@/lib/utils";

type JsonValue = unknown;

function valueType(value: JsonValue): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function previewValue(value: JsonValue): string {
  const type = valueType(value);
  if (type === "string") return `"${String(value)}"`;
  if (type === "number" || type === "boolean") return String(value);
  if (type === "null") return "null";
  if (type === "array") return `Array(${(value as unknown[]).length})`;
  if (type === "object") return `Object(${Object.keys(value as object).length})`;
  return String(value);
}

function nodeMatchesSearch(name: string | null, value: JsonValue, query: string): boolean {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return true;

  if (name && name.toLowerCase().includes(trimmed)) return true;

  const type = valueType(value);
  if (type === "string" || type === "number" || type === "boolean") {
    return String(value).toLowerCase().includes(trimmed);
  }

  if (type === "array") {
    return (value as JsonValue[]).some((item) => nodeMatchesSearch(null, item, query));
  }

  if (type === "object" && value) {
    return Object.entries(value as Record<string, JsonValue>).some(([key, child]) =>
      nodeMatchesSearch(key, child, query),
    );
  }

  return false;
}

function JsonTreeNode({
  name,
  value,
  depth,
  searchQuery,
  defaultCollapsed = false,
}: {
  name: string | null;
  value: JsonValue;
  depth: number;
  searchQuery: string;
  defaultCollapsed?: boolean;
}) {
  const type = valueType(value);
  const isBranch = type === "object" || type === "array";
  const childEntries = useMemo(() => {
    if (type === "array") {
      return (value as JsonValue[]).map((item, index) => [String(index), item] as const);
    }
    if (type === "object" && value) {
      return Object.entries(value as Record<string, JsonValue>);
    }
    return [];
  }, [type, value]);

  const matches = nodeMatchesSearch(name, value, searchQuery);
  const childMatches = useMemo(
    () =>
      childEntries.some(([key, child]) => nodeMatchesSearch(key, child, searchQuery)),
    [childEntries, searchQuery],
  );

  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  if (searchQuery.trim() && !matches && !childMatches) return null;

  if (!isBranch) {
    return (
      <div
        className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-2 py-1 font-mono text-xs"
        style={{ paddingLeft: depth * 12 }}
      >
        <span className="truncate text-muted-foreground">
          {name ? <HighlightText text={name} query={searchQuery} /> : "value"}
        </span>
        <span className="break-all text-foreground">
          <HighlightText text={previewValue(value)} query={searchQuery} />
        </span>
      </div>
    );
  }

  const label = name ?? "root";
  const branchLabel = `${label}: ${previewValue(value)}`;

  return (
    <div>
      <button
        type="button"
        className={cn(
          "interactive-row flex w-full items-center gap-1 rounded-sm py-1 text-left font-mono text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        )}
        style={{ paddingLeft: depth * 12 }}
        onClick={() => setCollapsed((prev) => !prev)}
        aria-expanded={!collapsed}
      >
        {collapsed ? (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        )}
        <span className="min-w-0 truncate">
          <HighlightText text={branchLabel} query={searchQuery} />
        </span>
      </button>
      {!collapsed
        ? childEntries.map(([key, child]) => (
            <JsonTreeNode
              key={`${label}-${key}`}
              name={key}
              value={child}
              depth={depth + 1}
              searchQuery={searchQuery}
              defaultCollapsed={depth >= 1}
            />
          ))
        : null}
    </div>
  );
}

export type TraceJsonViewerProps = {
  data: JsonValue;
  className?: string;
  title?: string;
};

export function TraceJsonViewer({ data, className, title = "Raw JSON" }: TraceJsonViewerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const jsonText = useMemo(() => JSON.stringify(data, null, 2), [data]);

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h4>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="relative min-w-[10rem] flex-1 sm:flex-none">
            <Search className="pointer-events-none absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search JSON…"
              className="h-8 pl-8 text-xs"
              aria-label="Search inside JSON"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() =>
              void copyWithToast(jsonText, {
                successTitle: "JSON copied",
              })
            }
          >
            <Copy className="h-3.5 w-3.5" />
            Copy JSON
          </Button>
        </div>
      </div>
      <div className="max-h-[min(24rem,50vh)] overflow-auto rounded-lg border border-border bg-muted/40 p-3">
        <JsonTreeNode name={null} value={data} depth={0} searchQuery={searchQuery} />
      </div>
    </div>
  );
}
