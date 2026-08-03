"use client";

import Link from "next/link";
import {
  ChevronsDownUp,
  ChevronsUpDown,
  Copy,
  FileText,
  Layers,
  Play,
  RotateCcw,
  Route,
} from "lucide-react";

import {
  resolveTraceCrossLinks,
} from "@/components/mlops/trace-explorer/trace-cross-links";
import {
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import type { TraceDetailResponse, TraceWaterfall, TraceWaterfallStep } from "@/lib/api";
import { copyWithToast } from "@/lib/toast-actions";
import type { TraceTreeNode } from "@/components/mlops/trace-explorer/trace-tree-utils";

export type TraceSpanActionContext = {
  traceId: string;
  step: TraceWaterfallStep | null;
  data: TraceDetailResponse | null | undefined;
  waterfall: TraceWaterfall | null;
  treeNode?: TraceTreeNode | null;
  hasTree?: boolean;
  logsAvailable?: boolean;
  onOpenLogsTab?: () => void;
  onJumpToParent?: () => void;
  onCollapseOthers?: () => void;
  onExpandAll?: () => void;
  onReplayFromTask?: (runId: string, taskId: string) => void;
  replayPending?: boolean;
};

export type TraceSpanActionId =
  | "copy-trace-id"
  | "copy-span-id"
  | "view-run"
  | "view-task"
  | "view-logs"
  | "replay-from-task"
  | "jump-to-parent"
  | "collapse-others"
  | "expand-all";

type TraceSpanAction = {
  id: TraceSpanActionId;
  label: string;
  icon: typeof Copy;
  disabled?: boolean;
  href?: string;
  onSelect?: () => void;
  separatorBefore?: boolean;
};

function readRunId(step: TraceWaterfallStep | null, data: TraceDetailResponse | null | undefined, waterfall: TraceWaterfall | null): string | null {
  if (!step) return data?.primary_run_id ?? waterfall?.run_id ?? null;
  if (step.kind === "run") return step.id;
  return step.run_id ?? data?.primary_run_id ?? waterfall?.run_id ?? null;
}

function readTaskId(step: TraceWaterfallStep | null): string | null {
  if (!step) return null;
  if (step.kind === "task") return step.id;
  return step.task_id ?? null;
}

export function resolveTraceSpanActions(ctx: TraceSpanActionContext): TraceSpanAction[] {
  const { traceId, step, data, waterfall, treeNode, hasTree, logsAvailable, onOpenLogsTab } = ctx;
  const links = resolveTraceCrossLinks({ step, data, waterfall, traceId });
  const runLink = links.find((link) => link.id === "run" || link.id === "primary-run");
  const taskLink = links.find((link) => link.id === "task");
  const logsLink = links.find((link) => link.id === "logs");
  const runId = readRunId(step, data, waterfall);
  const taskId = readTaskId(step);
  const canReplay =
    Boolean(runId && taskId && ctx.onReplayFromTask) &&
    (step?.kind === "task" || Boolean(step?.task_id));

  const actions: TraceSpanAction[] = [
    {
      id: "copy-trace-id",
      label: "Copy Trace ID",
      icon: Route,
      onSelect: () => void copyWithToast(traceId, { successTitle: "Trace ID copied" }),
    },
    {
      id: "copy-span-id",
      label: "Copy Span ID",
      icon: Copy,
      disabled: !step,
      onSelect: step
        ? () => void copyWithToast(step.id, { successTitle: "Span ID copied" })
        : undefined,
    },
  ];

  if (runLink || runId) {
    actions.push({
      id: "view-run",
      label: "View Run",
      icon: Play,
      href: runLink?.href ?? (runId ? `/runs/${encodeURIComponent(runId)}` : undefined),
    });
  }

  if (taskLink || taskId) {
    actions.push({
      id: "view-task",
      label: "View Task",
      icon: Layers,
      href: taskLink?.href ?? (taskId ? `/tasks/${encodeURIComponent(taskId)}` : undefined),
    });
  }

  if (logsLink || logsAvailable || (data?.log_count ?? 0) > 0) {
    actions.push({
      id: "view-logs",
      label: "View Logs",
      icon: FileText,
      href: onOpenLogsTab ? undefined : logsLink?.href,
      onSelect: onOpenLogsTab,
    });
  }

  if (canReplay && runId && taskId) {
    actions.push({
      id: "replay-from-task",
      label: "Re-run from task",
      icon: RotateCcw,
      disabled: Boolean(ctx.replayPending),
      onSelect: () => ctx.onReplayFromTask?.(runId, taskId),
      separatorBefore: true,
    });
  }

  actions.push({
    id: "jump-to-parent",
    label: "Jump to Parent",
    icon: ChevronsUpDown,
    disabled: !step || !treeNode?.parentId,
    onSelect: ctx.onJumpToParent,
    separatorBefore: !canReplay,
  });

  if (hasTree) {
    actions.push(
      {
        id: "collapse-others",
        label: "Collapse Others",
        icon: ChevronsDownUp,
        disabled: !step,
        onSelect: ctx.onCollapseOthers,
      },
      {
        id: "expand-all",
        label: "Expand All",
        icon: ChevronsUpDown,
        onSelect: ctx.onExpandAll,
      },
    );
  }

  return actions;
}

function renderActionItem(
  action: TraceSpanAction,
  Item: typeof DropdownMenuItem | typeof ContextMenuItem,
  Separator: typeof DropdownMenuSeparator | typeof ContextMenuSeparator,
) {
  const Icon = action.icon;

  const item =
    action.href && !action.onSelect ? (
      <Item key={action.id} asChild disabled={action.disabled}>
        <Link href={action.href}>
          <Icon className="h-3.5 w-3.5" aria-hidden />
          {action.label}
        </Link>
      </Item>
    ) : (
      <Item
        key={action.id}
        disabled={action.disabled}
        onSelect={(event) => {
          event.preventDefault();
          action.onSelect?.();
        }}
      >
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {action.label}
      </Item>
    );

  if (!action.separatorBefore) return item;
  return (
    <span key={`${action.id}-group`}>
      <Separator />
      {item}
    </span>
  );
}

export function TraceSpanDropdownItems(ctx: TraceSpanActionContext) {
  const actions = resolveTraceSpanActions(ctx);
  return <>{actions.map((action) => renderActionItem(action, DropdownMenuItem, DropdownMenuSeparator))}</>;
}

export function TraceSpanContextMenuItems(ctx: TraceSpanActionContext) {
  const actions = resolveTraceSpanActions(ctx);
  return <>{actions.map((action) => renderActionItem(action, ContextMenuItem, ContextMenuSeparator))}</>;
}
