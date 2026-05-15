import { cn } from "@/lib/utils"
import { CheckCircle2, XCircle, Clock, Loader2, AlertCircle, Info } from "lucide-react"

type StatusType = "success" | "failed" | "running" | "pending" | "cancelled" | "info" | "warning" | "error" | "critical"

interface StatusBadgeProps {
  status: StatusType
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
    bg: "bg-emerald-500/10",
    text: "text-emerald-400",
    border: "border-emerald-500/20",
  },
  failed: {
    icon: XCircle,
    bg: "bg-red-500/10",
    text: "text-red-400",
    border: "border-red-500/20",
  },
  error: {
    icon: XCircle,
    bg: "bg-red-500/10",
    text: "text-red-400",
    border: "border-red-500/20",
  },
  running: {
    icon: Loader2,
    bg: "bg-sky-500/10",
    text: "text-sky-400",
    border: "border-sky-500/20",
    iconClass: "animate-spin",
  },
  pending: {
    icon: Clock,
    bg: "bg-amber-500/10",
    text: "text-amber-400",
    border: "border-amber-500/20",
  },
  cancelled: {
    icon: XCircle,
    bg: "bg-zinc-500/10",
    text: "text-zinc-400",
    border: "border-zinc-500/20",
  },
  info: {
    icon: Info,
    bg: "bg-blue-500/10",
    text: "text-blue-400",
    border: "border-blue-500/20",
  },
  warning: {
    icon: AlertCircle,
    bg: "bg-amber-500/10",
    text: "text-amber-400",
    border: "border-amber-500/20",
  },
  critical: {
    icon: AlertCircle,
    bg: "bg-red-500/10",
    text: "text-red-400",
    border: "border-red-500/20",
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
  status,
  label,
  size = "sm",
  showIcon = true,
  className,
}: StatusBadgeProps) {
  const config = statusConfig[status]
  const Icon = config.icon
  const displayLabel = label ?? statusLabels[status]

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border font-medium",
        config.bg,
        config.text,
        config.border,
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-sm",
        className
      )}
    >
      {showIcon && (
        <Icon
          className={cn(
            size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5",
            config.iconClass
          )}
        />
      )}
      {displayLabel}
    </span>
  )
}
