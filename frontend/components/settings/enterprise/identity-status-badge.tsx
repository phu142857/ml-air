import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STATE_STYLES: Record<string, { label: string; className: string }> = {
  active: {
    label: "Active",
    className: "border-[color:var(--status-success-border)] bg-[color:var(--status-success-bg)] text-[color:var(--status-success-fg)]",
  },
  disabled: {
    label: "Disabled",
    className: "border-[color:var(--status-pending-border)] bg-[color:var(--status-pending-bg)] text-[color:var(--status-pending-fg)]",
  },
  locked: {
    label: "Locked",
    className: "border-[color:var(--status-failed-border)] bg-[color:var(--status-failed-bg)] text-[color:var(--status-failed-fg)]",
  },
  created: {
    label: "Disabled",
    className: "border-[color:var(--status-pending-border)] bg-[color:var(--status-pending-bg)] text-[color:var(--status-pending-fg)]",
  },
  revoked: {
    label: "Revoked",
    className: "border-border bg-muted text-muted-foreground",
  },
  pending_activation: {
    label: "Pending",
    className: "border-primary/30 bg-primary/10 text-primary",
  },
};

export function IdentityStatusBadge({ state, className }: { state: string | null | undefined; className?: string }) {
  const key = String(state || "unknown").toLowerCase();
  const config = STATE_STYLES[key] ?? {
    label: key.replace(/_/g, " "),
    className: "border-border bg-muted text-muted-foreground",
  };
  return (
    <Badge variant="outline" className={cn("text-[11px] font-medium capitalize", config.className, className)}>
      {config.label}
    </Badge>
  );
}
