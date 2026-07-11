"use client";

import { useMemo, useState } from "react";
import { Route, X } from "lucide-react";

import { TraceExplorerShell } from "@/components/mlops/trace-explorer/trace-explorer-shell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { TraceSearchHit } from "@/lib/api";
import { copyWithToast } from "@/lib/toast-actions";
import { normalizeTraceId } from "@/lib/trace-id";
import { cn } from "@/lib/utils";

type TraceExplorerDialogProps = {
  traceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function TraceExplorerDialog({ traceId, open, onOpenChange }: TraceExplorerDialogProps) {
  const normalized = normalizeTraceId(traceId) || traceId.trim();
  const [search, setSearch] = useState("");

  const traceList = useMemo<TraceSearchHit[]>(
    () => [
      {
        trace_id: normalized,
        source: "mlair",
      },
    ],
    [normalized],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="dialog-viewport-90 flex flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>Trace explorer</DialogTitle>
          <DialogDescription>Observability trace viewer for {normalized}</DialogDescription>
        </DialogHeader>

        <TraceExplorerShell
          traceList={traceList}
          selectedTraceId={normalized}
          onSelectTrace={() => {}}
          traceSearch={search}
          onTraceSearchChange={setSearch}
          headerAction={
            <DialogClose asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                aria-label="Close trace explorer"
              >
                <X className="h-4 w-4" />
              </Button>
            </DialogClose>
          }
        />
      </DialogContent>
    </Dialog>
  );
}

type TraceLinkProps = {
  traceId?: string | null;
  variant?: "button" | "link";
  size?: "sm" | "default";
  className?: string;
  label?: string;
};

export function TraceLink({ traceId, variant = "button", size = "sm", className, label }: TraceLinkProps) {
  const [open, setOpen] = useState(false);
  const normalized = normalizeTraceId(traceId);
  if (!normalized) return null;

  const shortId = `${normalized.slice(0, 8)}…`;
  const displayLabel = label?.trim() || shortId;

  if (variant === "link") {
    return (
      <>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn(
            "link-primary inline-flex max-w-full min-w-0 items-center gap-2 whitespace-nowrap text-xs",
            className,
          )}
        >
          <Route className="h-3 w-3 shrink-0" strokeWidth={1.75} />
          <span className="truncate font-mono">{displayLabel}</span>
        </button>
        <TraceExplorerDialog traceId={normalized} open={open} onOpenChange={setOpen} />
      </>
    );
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size={size}
        onClick={() => setOpen(true)}
        className={cn(
          "h-8 shrink-0 gap-2 whitespace-nowrap border-border px-2 text-xs text-primary",
          className,
        )}
      >
        <Route className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
        <span>{label?.trim() || "View trace"}</span>
      </Button>
      <TraceExplorerDialog traceId={normalized} open={open} onOpenChange={setOpen} />
    </>
  );
}

export async function copyTraceIdToClipboard(traceId: string) {
  const normalized = normalizeTraceId(traceId) || traceId.trim();
  await copyWithToast(normalized, { successTitle: "Trace ID copied" });
}
