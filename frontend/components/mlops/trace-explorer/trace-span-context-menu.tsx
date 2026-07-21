"use client";

import type { ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";

import {
  TraceSpanContextMenuItems,
  TraceSpanDropdownItems,
  type TraceSpanActionContext,
} from "@/components/mlops/trace-explorer/trace-span-actions";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type TraceSpanContextMenuProps = {
  children: ReactNode;
  context: TraceSpanActionContext;
};

export function TraceSpanRowMenu({
  context,
  className,
}: {
  context: TraceSpanActionContext;
  className?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className={cn(
            "h-7 w-7 opacity-0 transition-default group-hover/row:opacity-100 group-focus-within/row:opacity-100 focus-visible:opacity-100",
            className,
          )}
          aria-label="Span actions"
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        <TraceSpanDropdownItems {...context} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function TraceSpanContextMenu({ children, context }: TraceSpanContextMenuProps) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div>{children}</div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <TraceSpanContextMenuItems {...context} />
      </ContextMenuContent>
    </ContextMenu>
  );
}
