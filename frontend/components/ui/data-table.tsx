"use client";

import { HTMLAttributes, TableHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function DataTableShell({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "overflow-auto rounded-lg border border-border bg-card",
        className
      )}
      {...props}
    />
  );
}

/** Linear-style dense tables: tight type, full width. */
export function DataTable({ className, ...props }: TableHTMLAttributes<HTMLTableElement>) {
  return <table className={cn("w-full text-xs leading-snug", className)} {...props} />;
}
