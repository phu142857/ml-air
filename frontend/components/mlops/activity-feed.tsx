"use client";

import Link from "next/link";
import {
  Box,
  Bot,
  Database,
  GitBranch,
  Play,
  User,
} from "lucide-react";

import type { ActivityFeedItem } from "@/lib/api";
import { activityResourceHref, activityVerbLabel } from "@/lib/activity-feed";
import { cn, formatDateTimeCompact, formatRelativeTime } from "@/lib/utils";

type ActivityFeedProps = {
  items: ActivityFeedItem[];
  className?: string;
};

const scopeIcons: Record<string, typeof Database> = {
  model: Box,
  dataset: Database,
  pipeline: GitBranch,
  run: Play,
};

function ActorLine({ item }: { item: ActivityFeedItem }) {
  const isUser = item.actor_kind === "user";
  const who = item.actor_name || item.actor_id || (isUser ? "User" : "System");
  return (
    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
      {isUser ? (
        <User className="h-3.5 w-3.5 text-muted-foreground" />
      ) : (
        <Bot className="h-3.5 w-3.5 text-muted-foreground" />
      )}
      {who}
    </span>
  );
}

function ActivityFeedRow({ item }: { item: ActivityFeedItem }) {
  const Icon = scopeIcons[item.scope_type] ?? Box;
  const href = activityResourceHref(item);
  const verb = activityVerbLabel(item.verb);
  const timeLabel = item.ts ? formatDateTimeCompact(item.ts) : "—";
  const relative = item.ts ? formatRelativeTime(item.ts) : "";

  const body = (
  <div className="group flex gap-4 rounded-lg border border-border/70 bg-card/40 px-4 py-3 transition-default hover:border-primary/25 hover:bg-primary/5">
      <div className="w-14 shrink-0 pt-0.5 text-right">
        <p className="text-xs font-medium tabular-nums text-muted-foreground">{timeLabel}</p>
        {relative ? (
          <p className="text-[10px] text-muted-foreground/80">{relative}</p>
        ) : null}
      </div>
      <div className="flex min-w-0 flex-1 gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="h-4 w-4 text-primary" strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
            <ActorLine item={item} />
            <span className="text-sm text-muted-foreground">{verb}</span>
          </div>
          <p className="mt-0.5 text-sm font-semibold text-foreground">{item.title}</p>
          {item.summary ? (
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.summary}</p>
          ) : null}
          <p className="mt-1.5 text-[10px] uppercase tracking-wide text-muted-foreground/70">
            {item.scope_type}
            {item.scope_id ? ` · ${item.scope_id}` : ""}
          </p>
        </div>
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-lg">
        {body}
      </Link>
    );
  }
  return body;
}

export function ActivityFeed({ items, className }: ActivityFeedProps) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {items.map((item) => (
        <ActivityFeedRow key={item.id || `${item.ts}-${item.scope_id}-${item.verb}`} item={item} />
      ))}
    </div>
  );
}
