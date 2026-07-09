import { cn } from "@/lib/utils"
import { CheckCircle2, XCircle, Clock, Loader2, AlertCircle, Info } from "lucide-react"
import { normalizeStatus, statusToMlopsBadge } from "@/lib/status-style"

type StatusType = "success" | "failed" | "running" | "pending" | "cancelled" | "info" | "warning" | "error" | "critical"

interface StatusBadgeProps {
  /** API status string — mapped via status-style helpers. Preferred over `status`. */
  value?: string | null
  status?: StatusType
  label?: string
  size?: "sm" | "md"
  showIcon?: boolean
  className?: string
}

const statusConfig: Record<StatusType, {
  icon: React.ElementType
  bg: string
  text: string
  border: string
  iconClass?: string
}> = {
  success: {
    icon: CheckCircle2,
    bg: "bg-[color:var(--status-success-bg)]",
    text: "text-[color:var(--status-success-fg)]",
    border: "border-[color:var(--status-success-border)]",
  },
  failed: {
    icon: XCircle,
    bg: "bg-[color:var(--status-failed-bg)]",
    text: "text-[color:var(--status-failed-fg)]",
    border: "border-[color:var(--status-failed-border)]",
  },
  error: {
    icon: XCircle,
    bg: "bg-[color:var(--status-failed-bg)]",
    text: "text-[color:var(--status-failed-fg)]",
    border: "border-[color:var(--status-failed-border)]",
  },
  running: {
    icon: Loader2,
    bg: "bg-primary/10",
    text: "text-primary",
    border: "border-primary/30",
    iconClass: "animate-spin",
  },
  pending: {
    icon: Clock,
    bg: "bg-[color:var(--status-pending-bg)]",
    text: "text-[color:var(--status-pending-fg)]",
    border: "border-[color:var(--status-pending-border)]",
  },
  cancelled: {
    icon: XCircle,
    bg: "bg-muted",
    text: "text-muted-foreground",
    border: "border-border/60",
  },
  info: {
    icon: Info,
    bg: "bg-primary/10",
    text: "text-primary",
    border: "border-primary/30",
  },
  warning: {
    icon: AlertCircle,
    bg: "bg-[color:var(--status-pending-bg)]",
    text: "text-[color:var(--status-pending-fg)]",
    border: "border-[color:var(--status-pending-border)]",
  },
  critical: {
    icon: AlertCircle,
    bg: "bg-[color:var(--status-failed-bg)]",
    text: "text-[color:var(--status-failed-fg)]",
    border: "border-[color:var(--status-failed-border)]",
  },
}

const statusLabels: Record<StatusType, string> = {
  success: "Success",
  failed: "Failed",
  running: "Running",
  pending: "Pending",
  cancelled: "Cancelled",
  info: "Info",
  warning: "Warning",
  error: "Error",
  critical: "Critical",
}

export function StatusBadge({
  value,
  status,
  label,
  size = "sm",
  showIcon = true,
  className,
}: StatusBadgeProps) {
  const resolvedStatus: StatusType = value != null
    ? statusToMlopsBadge(value)
    : (status ?? "pending")
  const config = statusConfig[resolvedStatus]
  const Icon = config.icon
  const displayLabel = label ?? (value != null ? normalizeStatus(value) : statusLabels[resolvedStatus])

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-medium",
        config.bg,
        config.text,
        config.border,
        size === "sm" ? "px-2.5 py-0.5 text-xs" : "px-3 py-1 text-sm",
        className,
      )}
    >
      {showIcon && (
        <Icon
          strokeWidth={1.75}
          className={cn(
            size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5",
            config.iconClass,
          )}
        />
      )}
      {displayLabel}
    </span>
  )
}
