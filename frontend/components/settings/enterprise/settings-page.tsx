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
    <div className={cn("mx-auto w-full max-w-4xl space-y-8 pb-10", className)}>
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
  description,
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
  return (
    <header className="space-y-4 border-b border-border/60 pb-6">
      {backHref ? (
        <Button variant="ghost" size="sm" className="-ml-2 h-8 gap-1.5 px-2 text-muted-foreground" asChild>
          <Link href={backHref}>
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            {backLabel}
          </Link>
        </Button>
      ) : null}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
            {badge}
          </div>
          {description ? <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p> : null}
        </div>
        {(actions || secondaryActions) && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {secondaryActions}
            {actions}
          </div>
        )}
      </div>
    </header>
  );
}
