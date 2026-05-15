"use client";

import { HTMLAttributes, TableHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function DataTableShell({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "min-w-0 max-w-full overflow-x-auto overflow-y-auto overscroll-x-contain rounded-lg border border-zinc-800 bg-zinc-950/50 [-webkit-overflow-scrolling:touch]",
        className
      )}
      {...props}
    />
  );
}

/** Dense tables: at least full shell width; grows with content so the shell can scroll horizontally. */
export function DataTable({ className, ...props }: TableHTMLAttributes<HTMLTableElement>) {
  return (
    <table className={cn("min-w-full w-max border-collapse text-xs leading-snug", className)} {...props} />
  );
}
