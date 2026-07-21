"use client";

import type { LucideIcon } from "lucide-react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type TracePaneRailProps = {
  side: "left" | "right";
  icon: LucideIcon;
  label: string;
  onExpand: () => void;
  className?: string;
};

export function TracePaneRail({
  side,
  icon: Icon,
  label,
  onExpand,
  className,
}: TracePaneRailProps) {
  const ExpandIcon = side === "left" ? ChevronRight : ChevronLeft;

  return (
    <div
      className={cn(
        "flex h-full w-full min-w-[2.25rem] flex-col items-center gap-2 border-border bg-card py-3 transition-default",
        side === "left" ? "border-r" : "border-l",
        className,
      )}
    >
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="h-8 w-8 shrink-0"
        onClick={onExpand}
        aria-label={`Expand ${label}`}
        title={`Expand ${label}`}
      >
        <ExpandIcon className="h-4 w-4" />
      </Button>
      <span className="sr-only">{label} collapsed</span>
    </div>
  );
}
