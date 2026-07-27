"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Minus, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  DATASET_VERSION_PAGE_SIZE,
  patchDatasetVersionContent,
  previewDatasetVersion,
} from "@/lib/api";
import { mlairKeys } from "@/lib/query-keys";
import { describeTrainError } from "@/lib/describe-train-error";

export type DatasetVersionScrollEditorHandle = {
  save: () => Promise<boolean>;
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

const DEFAULT_COL_WIDTH = 128;
const DEFAULT_ROW_HEIGHT = 28;
const MIN_COL_WIDTH = 48;
const MAX_COL_WIDTH = 720;
const MIN_ROW_HEIGHT = 24;
const MAX_ROW_HEIGHT = 200;

function usePerKeyResize(defaultPx: number, minPx: number, maxPx: number) {
  const [sizes, setSizes] = useState<Record<string, number>>({});

  const get = useCallback(
    (key: string | number) => sizes[String(key)] ?? defaultPx,
    [sizes, defaultPx]
  );

  const setSize = useCallback(
    (key: string | number, px: number) => {
      const clamped = Math.min(maxPx, Math.max(minPx, px));
      setSizes((prev) => ({ ...prev, [String(key)]: clamped }));
    },
    [minPx, maxPx]
  );

  const reset = useCallback(() => setSizes({}), []);

  const startResize = useCallback(
    (key: string | number, startClient: number, axis: "x" | "y") => {
      const startSize = sizes[String(key)] ?? defaultPx;
      const onMove = (ev: PointerEvent) => {
        const delta = axis === "x" ? ev.clientX - startClient : ev.clientY - startClient;
        setSize(key, startSize + delta);
      };
      const onUp = () => {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };
      document.body.style.cursor = axis === "x" ? "col-resize" : "row-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    },
    [sizes, defaultPx, setSize]
  );

  return { get, reset, startResize };
}

function renderSizedCellInput(
  height: number,
  value: string,
  onChange: (value: string) => void,
  extraClass = ""
) {
  const shared = [
    "min-h-0 resize-none rounded-none border-0 bg-transparent px-2 py-1 font-mono text-[11px] shadow-none focus-visible:ring-1",
    extraClass || "size-full",
  ].join(" ");
  const style = { height, minHeight: height };
  if (height > 36) {
    return <Textarea className={shared} style={style} value={value} onChange={(e) => onChange(e.target.value)} spellCheck={false} />;
  }
  return <Input className={shared} style={style} value={value} onChange={(e) => onChange(e.target.value)} spellCheck={false} />;
}

// Structural operations that add/remove rows (applied on top of the base loaded data)
type RowOp =
  | { kind: "delete"; row_index: number }
  | { kind: "insert"; after_index: number; values: Record<string, string> };

type LineOp =
  | { kind: "delete"; line_index: number }
  | { kind: "insert"; after_index: number; line: string };

export const DatasetVersionScrollEditor = forwardRef<
  DatasetVersionScrollEditorHandle,
  {
    tenantId: string;
    projectId: string;
    versionId: string;
    token: string;
    canEdit: boolean;
    onDirtyChange?: (dirty: boolean) => void;
  }
>(function DatasetVersionScrollEditor(
  { tenantId, projectId, versionId, token, canEdit, onDirtyChange },
  ref
) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Value edits (patches)
  const [rowEdits, setRowEdits] = useState<Map<number, Record<string, string>>>(new Map());
  const [lineEdits, setLineEdits] = useState<Map<number, string>>(new Map());
  // Structural ops (delete/insert)
  const [rowOps, setRowOps] = useState<RowOp[]>([]);
  const [lineOps, setLineOps] = useState<LineOp[]>([]);

  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);

  const colResize = usePerKeyResize(DEFAULT_COL_WIDTH, MIN_COL_WIDTH, MAX_COL_WIDTH);
  const rowResize = usePerKeyResize(DEFAULT_ROW_HEIGHT, MIN_ROW_HEIGHT, MAX_ROW_HEIGHT);
  const lineResize = usePerKeyResize(DEFAULT_ROW_HEIGHT, MIN_ROW_HEIGHT, MAX_ROW_HEIGHT);
  const resetColWidths = colResize.reset;
  const resetRowHeights = rowResize.reset;
  const resetLineHeights = lineResize.reset;

  const previewQuery = useInfiniteQuery({
    queryKey: mlairKeys.datasets.versionPreview(tenantId, projectId, versionId),
    queryFn: ({ pageParam }) =>
      previewDatasetVersion(tenantId, projectId, versionId, token, {
        cursor: (pageParam as string | null) ?? undefined,
        limit: DATASET_VERSION_PAGE_SIZE,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => (last.has_more && last.next_cursor ? last.next_cursor : undefined),
    enabled: Boolean(versionId && token),
  });

  const previewColumns = previewQuery.data?.pages[0]?.columns ?? [];

  const meta = previewQuery.data?.pages[0];
  const columns = previewColumns;
  const format = meta?.format ?? "csv";
  const editable = Boolean(meta?.editable && canEdit);

  // Build local view: start from server rows, apply patches + structural ops
  const csvRows = useMemo(() => {
    // 1. Collect server rows
    const serverMap = new Map<number, Record<string, string>>();
    for (const page of previewQuery.data?.pages ?? []) {
      for (const r of page.rows ?? []) {
        serverMap.set(r.row_index, r.values);
      }
    }
    // 2. Apply value edits
    for (const [idx, vals] of rowEdits) {
      serverMap.set(idx, { ...(serverMap.get(idx) ?? {}), ...vals });
    }
    let rows = Array.from(serverMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([row_index, values]) => ({ row_index, values }));
    // 3. Apply structural ops in order
    for (const op of rowOps) {
      if (op.kind === "delete") {
        rows = rows.filter((r) => r.row_index !== op.row_index);
      } else {
        const insertAt = rows.findIndex((r) => r.row_index === op.after_index) + 1;
        // Use a synthetic index (negative) so key is unique and won't clash
        const syntheticIndex = -(Date.now() + Math.random());
        const newRow = { row_index: syntheticIndex, values: op.values };
        rows.splice(insertAt < 0 ? 0 : insertAt, 0, newRow);
      }
    }
    return rows;
  }, [previewQuery.data?.pages, rowEdits, rowOps]);

  const jsonlLines = useMemo(() => {
    const serverMap = new Map<number, string>();
    for (const page of previewQuery.data?.pages ?? []) {
      for (const ln of page.lines ?? []) {
        serverMap.set(ln.line_index, ln.line);
      }
    }
    for (const [idx, line] of lineEdits) {
      serverMap.set(idx, line);
    }
    let lines = Array.from(serverMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([line_index, line]) => ({ line_index, line }));
    for (const op of lineOps) {
      if (op.kind === "delete") {
        lines = lines.filter((l) => l.line_index !== op.line_index);
      } else {
        const insertAt = lines.findIndex((l) => l.line_index === op.after_index) + 1;
        const syntheticIndex = -(Date.now() + Math.random());
        lines.splice(insertAt < 0 ? 0 : insertAt, 0, { line_index: syntheticIndex, line: op.line });
      }
    }
    return lines;
  }, [previewQuery.data?.pages, lineEdits, lineOps]);

  const dirty =
    rowEdits.size > 0 || lineEdits.size > 0 || rowOps.length > 0 || lineOps.length > 0;

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    setRowEdits(new Map());
    setLineEdits(new Map());
    setRowOps([]);
    setLineOps([]);
    setSaveError("");
    resetColWidths();
    resetRowHeights();
    resetLineHeights();
  }, [versionId, resetColWidths, resetRowHeights, resetLineHeights]);

  useEffect(() => {
    resetColWidths();
  }, [previewColumns.join("\0"), resetColWidths]);

  const fetchNext = previewQuery.fetchNextPage;
  const hasNext = previewQuery.hasNextPage;
  const isFetchingNext = previewQuery.isFetchingNextPage;

  useEffect(() => {
    const root = scrollRef.current;
    const target = loadMoreRef.current;
    if (!root || !target || !hasNext || isFetchingNext) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void fetchNext();
      },
      { root, rootMargin: "120px", threshold: 0 }
    );
    obs.observe(target);
    return () => obs.disconnect();
  }, [fetchNext, hasNext, isFetchingNext]);

  const onCsvCellChange = useCallback(
    (rowIndex: number, col: string, value: string, base: Record<string, string>) => {
      if (!editable || rowIndex < 0) return; // synthetic rows edited via rowOps values directly
      setRowEdits((prev) => {
        const next = new Map(prev);
        next.set(rowIndex, { ...base, [col]: value });
        return next;
      });
    },
    [editable]
  );

  const [syntheticRowEdits, setSyntheticRowEdits] = useState<Map<number, Record<string, string>>>(
    new Map()
  );

  const onJsonlLineChange = useCallback(
    (lineIndex: number, value: string) => {
      if (!editable || lineIndex < 0) return;
      setLineEdits((prev) => {
        const next = new Map(prev);
        next.set(lineIndex, value);
        return next;
      });
    },
    [editable]
  );

  const [syntheticLineEdits, setSyntheticLineEdits] = useState<Map<number, string>>(new Map());

  const deleteRow = useCallback(
    (rowIndex: number) => {
      if (!editable || rowIndex < 0) return;
      setRowOps((prev) => [...prev, { kind: "delete", row_index: rowIndex }]);
      setRowEdits((prev) => {
        const next = new Map(prev);
        next.delete(rowIndex);
        return next;
      });
    },
    [editable]
  );

  const insertRowAfter = useCallback(
    (rowIndex: number) => {
      if (!editable) return;
      const emptyValues: Record<string, string> = {};
      for (const col of columns) emptyValues[col] = "";
      setRowOps((prev) => [...prev, { kind: "insert", after_index: rowIndex, values: emptyValues }]);
    },
    [editable, columns]
  );

  const deleteLine = useCallback(
    (lineIndex: number) => {
      if (!editable || lineIndex < 0) return;
      setLineOps((prev) => [...prev, { kind: "delete", line_index: lineIndex }]);
      setLineEdits((prev) => {
        const next = new Map(prev);
        next.delete(lineIndex);
        return next;
      });
    },
    [editable]
  );

  const insertLineAfter = useCallback(
    (lineIndex: number) => {
      if (!editable) return;
      setLineOps((prev) => [...prev, { kind: "insert", after_index: lineIndex, line: "" }]);
    },
    [editable]
  );

  const save = useCallback(async (): Promise<boolean> => {
    if (!editable || !dirty) return true;
    setSaving(true);
    setSaveError("");
    try {
      if (format === "jsonl") {
        await patchDatasetVersionContent(tenantId, projectId, versionId, token, {
          line_patches: Array.from(lineEdits.entries()).map(([line_index, line]) => ({
            line_index,
            line,
          })),
          line_deletes: lineOps
            .filter((op): op is Extract<LineOp, { kind: "delete" }> => op.kind === "delete")
            .map((op) => op.line_index),
          line_inserts: lineOps
            .filter((op): op is Extract<LineOp, { kind: "insert" }> => op.kind === "insert")
            .map((op) => ({
              after_index: op.after_index,
              line: syntheticLineEdits.get(op.after_index) ?? op.line,
            })),
        });
        setLineEdits(new Map());
        setLineOps([]);
        setSyntheticLineEdits(new Map());
      } else {
        // Build final values for inserted rows using syntheticRowEdits
        const inserts = rowOps
          .filter((op): op is Extract<RowOp, { kind: "insert" }> => op.kind === "insert")
          .map((op) => {
            const baseValues = op.values;
            const overrides = syntheticRowEdits.get(op.after_index) ?? {};
            return {
              after_index: op.after_index,
              values: { ...baseValues, ...overrides },
            };
          });
        await patchDatasetVersionContent(tenantId, projectId, versionId, token, {
          row_patches: Array.from(rowEdits.entries()).map(([row_index, values]) => ({
            row_index,
            values,
          })),
          row_deletes: rowOps
            .filter((op): op is Extract<RowOp, { kind: "delete" }> => op.kind === "delete")
            .map((op) => op.row_index),
          row_inserts: inserts,
        });
        setRowEdits(new Map());
        setRowOps([]);
        setSyntheticRowEdits(new Map());
      }
      await previewQuery.refetch();
      return true;
    } catch (err) {
      setSaveError(describeTrainError(err));
      return false;
    } finally {
      setSaving(false);
    }
  }, [
    dirty,
    editable,
    format,
    lineEdits,
    lineOps,
    previewQuery,
    projectId,
    rowEdits,
    rowOps,
    syntheticLineEdits,
    syntheticRowEdits,
    tenantId,
    token,
    versionId,
  ]);

  useImperativeHandle(ref, () => ({ save }), [save]);

  if (previewQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }
  if (previewQuery.isError) {
    return (
      <p className="text-sm text-[color:var(--status-failed-fg)]">
        {describeTrainError(previewQuery.error)}
      </p>
    );
  }
  if (!meta) return null;

  const total = meta.total_count ?? 0;
  const loaded = format === "csv" ? csvRows.length : jsonlLines.length;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
      <div className="flex shrink-0 flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
        <span className="rounded border border-border px-1.5 py-0.5 uppercase">{format}</span>
        <span>{formatBytes(meta.byte_size)}</span>
        <span>
          {loaded} / {total} loaded
        </span>
        {dirty ? <span className="text-[color:var(--status-pending-fg)] dark:text-[color:var(--status-pending-fg)]">Unsaved edits</span> : null}
        {!meta.editable ? (
          <span>File &gt; {formatBytes(meta.max_editor_bytes)} — read-only</span>
        ) : !canEdit ? (
          <span>Viewer — read-only</span>
        ) : null}
      </div>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-auto rounded-md border border-border bg-background"
      >
        {format === "csv" ? (
          <table className="w-max min-w-full border-collapse text-left text-xs">
            <thead className="sticky top-0 z-10 bg-muted/95">
              <tr className="border-b border-border">
                {editable ? (
                  <th className="sticky left-0 z-20 w-16 border-r border-border bg-muted/95 px-1 py-1.5 text-center" />
                ) : null}
                <th className="sticky left-0 z-20 w-12 border-r border-border bg-muted/95 px-2 py-1.5 text-center font-semibold">
                  #
                </th>
                {columns.map((col) => {
                  const w = colResize.get(col);
                  return (
                    <th
                      key={col}
                      className="relative max-w-none overflow-hidden px-3 py-1.5 font-semibold"
                      style={{ width: w, minWidth: w, maxWidth: w }}
                    >
                      <span className="block truncate pr-2" title={col}>
                        {col}
                      </span>
                      <div
                        role="separator"
                        aria-orientation="vertical"
                        aria-label={`Resize column ${col}`}
                        className="absolute top-0 right-0 z-30 h-full w-1.5 cursor-col-resize touch-none hover:bg-primary/40"
                        onPointerDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          colResize.startResize(col, e.clientX, "x");
                        }}
                      />
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {csvRows.map(({ row_index, values }, displayIdx) => {
                const isSynthetic = row_index < 0;
                const rowKey = isSynthetic ? `new:${displayIdx}` : String(row_index);
                const rowH = rowResize.get(rowKey);
                return (
                  <tr
                    key={isSynthetic ? `new:${displayIdx}` : row_index}
                    className="group border-b border-border/60 hover:bg-muted/20"
                    style={{ height: rowH }}
                  >
                    {editable ? (
                      <td className="sticky left-0 z-[1] border-r border-border bg-background p-0 text-center">
                        <div className="flex items-center justify-center gap-0.5 px-0.5">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 rounded text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-[var(--status-failed-bg)] hover:text-[color:var(--status-failed-fg)]"
                            title="Delete this row"
                            onClick={() => {
                              if (isSynthetic) {
                                const syntheticsBefore = csvRows
                                  .slice(0, displayIdx + 1)
                                  .filter((r) => r.row_index < 0).length - 1;
                                setRowOps((prev) => {
                                  let removeCount = 0;
                                  return prev.filter((op) => {
                                    if (op.kind !== "insert") return true;
                                    if (removeCount === syntheticsBefore) {
                                      removeCount++;
                                      return false;
                                    }
                                    removeCount++;
                                    return true;
                                  });
                                });
                              } else {
                                deleteRow(row_index);
                              }
                            }}
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 rounded text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-muted"
                            title="Insert empty row after this one"
                            onClick={() => insertRowAfter(row_index)}
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                      </td>
                    ) : null}
                    <td className="relative sticky left-0 z-[1] border-r border-border bg-background px-2 py-0.5 text-center font-mono text-[10px] text-muted-foreground">
                      {isSynthetic ? (
                        <span className="text-[color:var(--status-success-fg)]">+</span>
                      ) : (
                        row_index + 1
                      )}
                      <div
                        role="separator"
                        aria-orientation="horizontal"
                        aria-label={`Resize row ${row_index + 1}`}
                        className="absolute right-0 bottom-0 left-0 z-10 h-1.5 cursor-row-resize touch-none hover:bg-primary/40"
                        onPointerDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          rowResize.startResize(rowKey, e.clientY, "y");
                        }}
                      />
                    </td>
                    {columns.map((col) => {
                      const w = colResize.get(col);
                      const cellStyle = {
                        width: w,
                        minWidth: w,
                        maxWidth: w,
                        height: rowH,
                        minHeight: rowH,
                      };
                      const cellValue = isSynthetic
                        ? (syntheticRowEdits.get(row_index)?.[col] ?? values[col] ?? "")
                        : (values[col] ?? "");
                      return (
                        <td key={`${row_index}:${col}`} className="p-0 align-top" style={cellStyle}>
                          {editable
                            ? renderSizedCellInput(rowH, cellValue, (next) => {
                                if (isSynthetic) {
                                  setSyntheticRowEdits((prev) => {
                                    const map = new Map(prev);
                                    const existing = map.get(row_index) ?? { ...values };
                                    map.set(row_index, { ...existing, [col]: next });
                                    return map;
                                  });
                                } else {
                                  onCsvCellChange(row_index, col, next, values);
                                }
                              })
                            : (
                              <span
                                className="block overflow-auto px-2 py-1 font-mono text-[11px] break-words whitespace-pre-wrap"
                                style={{ height: rowH, minHeight: rowH }}
                              >
                                {cellValue}
                              </span>
                            )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {editable ? (
                <tr>
                  <td colSpan={columns.length + 2} className="px-2 py-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        const lastRow = csvRows[csvRows.length - 1];
                        insertRowAfter(lastRow ? lastRow.row_index : -1);
                      }}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add row
                    </Button>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        ) : (
          <div className="divide-y divide-border">
            {jsonlLines.map(({ line_index, line }, displayIdx) => {
              const isSynthetic = line_index < 0;
              const lineKey = isSynthetic ? `new:${displayIdx}` : String(line_index);
              const lineH = lineResize.get(lineKey);
              const currentLine = isSynthetic
                ? (syntheticLineEdits.get(line_index) ?? line)
                : line;
              return (
                <div
                  key={isSynthetic ? `new:${displayIdx}` : line_index}
                  className="group relative flex items-start gap-1 px-1 py-0.5"
                  style={{ minHeight: lineH }}
                >
                  <div className="flex shrink-0 flex-col gap-0.5">
                    {editable ? (
                      <>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 rounded text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-[var(--status-failed-bg)] hover:text-[color:var(--status-failed-fg)]"
                          title="Delete this line"
                          onClick={() => {
                            if (isSynthetic) {
                              const syntheticsBefore = jsonlLines
                                .slice(0, displayIdx + 1)
                                .filter((l) => l.line_index < 0).length - 1;
                              setLineOps((prev) => {
                                let removeCount = 0;
                                return prev.filter((op) => {
                                  if (op.kind !== "insert") return true;
                                  if (removeCount === syntheticsBefore) {
                                    removeCount++;
                                    return false;
                                  }
                                  removeCount++;
                                  return true;
                                });
                              });
                            } else {
                              deleteLine(line_index);
                            }
                          }}
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 rounded text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-muted"
                          title="Insert empty line after"
                          onClick={() => insertLineAfter(line_index)}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </>
                    ) : null}
                  </div>
                  <span className="w-10 shrink-0 text-right font-mono text-[10px] text-muted-foreground">
                    {isSynthetic ? (
                      <span className="text-[color:var(--status-success-fg)]">+</span>
                    ) : (
                      line_index + 1
                    )}
                  </span>
                  <div className="min-w-0 flex-1 self-stretch pt-0.5">
                  {editable
                    ? renderSizedCellInput(lineH, currentLine, (next) => {
                        if (isSynthetic) {
                          setSyntheticLineEdits((prev) => {
                            const map = new Map(prev);
                            map.set(line_index, next);
                            return map;
                          });
                        } else {
                          onJsonlLineChange(line_index, next);
                        }
                      }, "size-full min-w-0")
                    : (
                      <pre
                        className="min-w-0 flex-1 overflow-auto font-mono text-[11px] whitespace-pre-wrap break-words"
                        style={{ minHeight: lineH, height: lineH }}
                      >
                      {line}
                    </pre>
                    )}
                  </div>
                  <div
                    role="separator"
                    aria-orientation="horizontal"
                    aria-label={`Resize line ${line_index + 1}`}
                    className="absolute right-0 bottom-0 left-0 z-10 h-1.5 cursor-row-resize touch-none hover:bg-primary/40"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      lineResize.startResize(lineKey, e.clientY, "y");
                    }}
                  />
                </div>
              );
            })}
            {editable ? (
              <div className="px-2 py-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    const lastLine = jsonlLines[jsonlLines.length - 1];
                    insertLineAfter(lastLine ? lastLine.line_index : -1);
                  }}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add line
                </Button>
              </div>
            ) : null}
          </div>
        )}

        <div ref={loadMoreRef} className="flex justify-center py-3 text-[10px] text-muted-foreground">
          {isFetchingNext ? "Loading more…" : hasNext ? "Scroll for more" : loaded >= total ? "End of file" : null}
        </div>
      </div>

      {saveError ? (
        <p className="shrink-0 text-xs text-[color:var(--status-failed-fg)]">{saveError}</p>
      ) : null}
    </div>
  );
});
