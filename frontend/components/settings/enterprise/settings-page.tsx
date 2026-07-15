"use client";

import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function SettingsPage({
  children,
  className,
  loading,
  error,
}: {
  children: React.ReactNode;
  className?: string;
  loading?: boolean;
  error?: string | null;
}) {
  return (
    <div className={cn("flex min-h-0 w-full min-w-0 flex-1 flex-col gap-4", className)}>
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status" aria-live="polite">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading…
        </div>
      ) : null}
      {error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {children}
    </div>
  );
}

export function SettingsPageHeader({
  title,
  badge,
  backHref,
  backLabel = "Back",
  actions,
  secondaryActions,
}: {
  title: string;
  description?: string;
  badge?: React.ReactNode;
  backHref?: string;
  backLabel?: string;
  actions?: React.ReactNode;
  secondaryActions?: React.ReactNode;
}) {
  const hasToolbar = Boolean(backHref || actions || secondaryActions);
  if (!hasToolbar) return null;

  return (
    <header className="space-y-4 border-b border-border/60 pb-4">
      {backHref ? (
        <Button variant="ghost" size="sm" className="-ml-2 h-8 gap-1.5 px-2 text-muted-foreground" asChild>
          <Link href={backHref}>
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            {backLabel}
          </Link>
        </Button>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-2.5">
          <span className="sr-only">{title}</span>
          {badge}
        </div>
        {actions || secondaryActions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {secondaryActions}
            {actions}
          </div>
        ) : null}
      </div>
    </header>
  );
}
