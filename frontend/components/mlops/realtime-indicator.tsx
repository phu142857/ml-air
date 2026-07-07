"use client"

import { useSyncExternalStore } from "react"
import { Loader2, Radio, RefreshCw, WifiOff } from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import {
  getMlairRealtimeUiStatus,
  subscribeMlairRealtimeUiStatus,
  type MlairRealtimeUiStatus,
} from "@/lib/mlair-realtime-status"

function useMlairRealtimeUiStatus(): MlairRealtimeUiStatus {
  return useSyncExternalStore(
    subscribeMlairRealtimeUiStatus,
    getMlairRealtimeUiStatus,
    getMlairRealtimeUiStatus,
  )
}

type StatusPresentation = {
  icon: typeof Radio
  label: string
  description: string
  dotClass: string
  textClass: string
  pulse?: boolean
  spin?: boolean
}

function statusPresentation(status: MlairRealtimeUiStatus): StatusPresentation {
  switch (status.kind) {
    case "connected":
      return {
        icon: Radio,
        label: "Live",
        description: "Real-time updates via WebSocket",
        dotClass: "bg-[color:var(--status-success-fg)]",
        textClass: "text-[color:var(--status-success-fg)]",
        pulse: true,
      }
    case "polling":
      return {
        icon: RefreshCw,
        label: "Polling",
        description: "WebSocket unavailable — refreshing data periodically",
        dotClass: "bg-[color:var(--status-pending-fg)]",
        textClass: "text-[color:var(--status-pending-fg)]",
        spin: true,
      }
    case "connecting":
      return {
        icon: Loader2,
        label: "Connecting",
        description: "Opening WebSocket connection…",
        dotClass: "bg-[color:var(--status-pending-fg)]",
        textClass: "text-[color:var(--status-pending-fg)]",
        spin: true,
      }
    case "reconnecting":
      return {
        icon: RefreshCw,
        label: "Reconnecting",
        description: "WebSocket dropped — retrying connection",
        dotClass: "bg-[color:var(--status-pending-fg)]",
        textClass: "text-[color:var(--status-pending-fg)]",
        spin: true,
      }
    case "inactive":
      return {
        icon: Radio,
        label: "No scope",
        description: "Pin tenant and project for live updates",
        dotClass: "bg-muted-foreground/50",
        textClass: "text-muted-foreground",
      }
    case "fatal":
      return {
        icon: WifiOff,
        label: "Offline",
        description: `Real-time connection closed (code ${status.code})`,
        dotClass: "bg-destructive",
        textClass: "text-destructive",
      }
  }
}

export function RealtimeIndicator() {
  const status = useMlairRealtimeUiStatus()
  const config = statusPresentation(status)
  const Icon = config.icon

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={config.label}
            className="flex max-w-[10rem] items-center gap-2 rounded-xl border border-border/60 bg-muted/30 px-2.5 py-1.5 transition-premium hover:bg-muted/50 active:scale-[0.98] sm:max-w-none"
          >
            <div className="relative shrink-0">
              <div className={cn("h-2 w-2 rounded-full", config.dotClass)} />
              {config.pulse ? (
                <div
                  className={cn(
                    "absolute inset-0 h-2 w-2 animate-ping rounded-full opacity-75",
                    config.dotClass,
                  )}
                />
              ) : null}
            </div>
            <Icon
              strokeWidth={1.75}
              className={cn(
                "h-3.5 w-3.5 shrink-0",
                config.textClass,
                config.spin && "animate-spin",
              )}
            />
            <span className={cn("hidden truncate text-xs font-medium sm:inline", config.textClass)}>
              {config.label}
            </span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          <div className="flex flex-col gap-1">
            <span className="font-medium">{config.label}</span>
            <span className="text-xs text-muted-foreground">{config.description}</span>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
