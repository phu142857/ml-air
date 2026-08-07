"use client";

import { useState } from "react";
import { Activity, RefreshCw } from "lucide-react";

import { ActivityFeed } from "@/components/mlops/activity-feed";
import { MlopsEmptyState, ResourcePageHeader, ScopePinnedInline } from "@/components/mlops/layout";
import { Button } from "@/components/ui/button";
import { useActivityFeedInfinite } from "@/hooks/use-activity-feed-infinite";
import {
  ACTIVITY_SCOPE_OPTIONS,
  type ActivityScopeType,
} from "@/lib/activity-feed";
import { SCOPE_AGGREGATE_LIFECYCLE } from "@/lib/scope-messages";
import { cn, formatApiClientError } from "@/lib/utils";

export default function ActivityPage() {
  const [scopeType, setScopeType] = useState<ActivityScopeType>("all");
  const {
    items,
    scopePinned,
    isLoading,
    isRefetching,
    isError,
    error,
    refresh,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useActivityFeedInfinite(scopeType);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <ResourcePageHeader
        className="shrink-0"
        icon={Activity}
        accent="emerald"
        title="Activity"
        actions={
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-2 text-xs"
            onClick={() => void refresh()}
            disabled={isRefetching || !scopePinned}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isRefetching && "animate-spin")} />
            Refresh
          </Button>
        }
      />

      <div className="shrink-0 page-toolbar space-y-3">
        {!scopePinned ? (
          <ScopePinnedInline message={SCOPE_AGGREGATE_LIFECYCLE} />
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {ACTIVITY_SCOPE_OPTIONS.map((opt) => (
              <Button
                key={opt.id}
                type="button"
                size="sm"
                variant={scopeType === opt.id ? "default" : "outline"}
                className="h-7 text-xs"
                onClick={() => setScopeType(opt.id)}
              >
                {opt.label}
              </Button>
            ))}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {!scopePinned ? (
          <MlopsEmptyState
            icon={Activity}
            title="Pin a project"
            description="Activity feed is available when tenant and project scope are pinned."
          />
        ) : isLoading ? (
          <p className="text-sm text-muted-foreground">Loading activity…</p>
        ) : isError ? (
          <p className="text-sm text-[color:var(--status-failed-fg)]">{formatApiClientError(error)}</p>
        ) : items.length === 0 ? (
          <MlopsEmptyState
            icon={Activity}
            title="No activity yet"
            description="Domain events will appear here when projections are enabled."
          />
        ) : (
          <>
            <ActivityFeed items={items} />
            {hasNextPage ? (
              <div className="mt-6 flex justify-center border-t border-border/60 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isFetchingNextPage}
                  onClick={() => void fetchNextPage()}
                >
                  {isFetchingNextPage ? "Loading…" : "Load more"}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
