import { cn } from "@/lib/utils";

export function SettingsSection({
  id,
  title,
  description,
  children,
  className,
  headerActions,
}: {
  id?: string;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  headerActions?: React.ReactNode;
}) {
  return (
    <section id={id} className={cn("scroll-mt-4", className)} aria-labelledby={id ? `${id}-title` : undefined}>
      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-start justify-between gap-4 border-b border-border/60 px-5 py-4">
          <div className="min-w-0">
            <h2 id={id ? `${id}-title` : undefined} className="text-sm font-semibold text-foreground">
              {title}
            </h2>
          </div>
          {headerActions ? <div className="shrink-0">{headerActions}</div> : null}
        </div>
        <div className="px-5 py-5">{children}</div>
      </div>
    </section>
  );
}
