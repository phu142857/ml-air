import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Simple title strip (legacy). */
export function PageChrome({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="border-b border-zinc-800 bg-zinc-950/50 px-6 py-4">
      <h1 className="text-lg font-semibold text-zinc-100">{title}</h1>
      {subtitle ? <p className="mt-1 text-xs text-zinc-500">{subtitle}</p> : null}
    </div>
  );
}

const accentStyles = {
  emerald: {
    wrap: "from-emerald-500/20 to-emerald-600/10 border-emerald-500/20",
    icon: "text-emerald-400"
  },
  sky: {
    wrap: "from-sky-500/20 to-sky-600/10 border-sky-500/20",
    icon: "text-sky-400"
  },
  violet: {
    wrap: "from-violet-500/20 to-violet-600/10 border-violet-500/20",
    icon: "text-violet-400"
  },
  amber: {
    wrap: "from-amber-500/20 to-amber-600/10 border-amber-500/20",
    icon: "text-amber-400"
  },
  zinc: {
    wrap: "from-zinc-500/20 to-zinc-600/10 border-zinc-500/20",
    icon: "text-zinc-400"
  },
  brand: {
    wrap: "from-sky-500 to-emerald-500 border-transparent",
    icon: "text-white"
  }
} as const;

export type ResourceAccent = keyof typeof accentStyles;

/** Hero header row for list/detail pages (icon tile + title + optional actions). */
export function ResourcePageHeader({
  icon: Icon,
  title,
  subtitle,
  accent = "zinc",
  actions
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  accent?: ResourceAccent;
  actions?: ReactNode;
}) {
  const a = accentStyles[accent] ?? accentStyles.zinc;
  return (
    <div className="border-b border-zinc-800 bg-zinc-950/50 px-6 py-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-gradient-to-br",
              a.wrap
            )}
          >
            <Icon className={cn("h-5 w-5", a.icon)} />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold text-zinc-100">{title}</h1>
            {subtitle ? <p className="mt-0.5 text-xs leading-snug text-zinc-500">{subtitle}</p> : null}
          </div>
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{actions}</div>
        ) : null}
      </div>
    </div>
  );
}
