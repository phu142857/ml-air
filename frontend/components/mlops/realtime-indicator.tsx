"use client"

import { useState, useEffect } from "react"
import { Wifi, WifiOff, RefreshCw } from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

type ConnectionStatus = "connected" | "polling" | "disconnected"

export function RealtimeIndicator() {
  const [status, setStatus] = useState<ConnectionStatus>("connected")

  useEffect(() => {
    const statuses: ConnectionStatus[] = ["connected", "polling", "disconnected"]
    let index = 0

    const interval = setInterval(() => {
      index = (index + 1) % statuses.length
      setStatus(Math.random() > 0.1 ? "connected" : statuses[index])
    }, 30000)

    return () => clearInterval(interval)
  }, [])

  const statusConfig = {
    connected: {
      icon: Wifi,
      label: "WebSocket Connected",
      description: "Real-time updates active",
      color: "bg-[color:var(--status-success-fg)]",
      textColor: "text-[color:var(--status-success-fg)]",
    },
    polling: {
      icon: RefreshCw,
      label: "Polling Mode",
      description: "WebSocket unavailable, using polling fallback",
      color: "bg-[color:var(--status-pending-fg)]",
      textColor: "text-[color:var(--status-pending-fg)]",
    },
    disconnected: {
      icon: WifiOff,
      label: "Disconnected",
      description: "Unable to connect to real-time service",
      color: "bg-destructive",
      textColor: "text-destructive",
    },
  }

  const config = statusConfig[status]
  const Icon = config.icon

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-2 rounded-xl border border-border/60 bg-muted/30 px-2.5 py-1.5 transition-premium hover:bg-muted/50 active:scale-[0.98]"
          >
            <div className="relative">
              <div className={cn("h-2 w-2 rounded-full", config.color)} />
              {status === "connected" && (
                <div
                  className={cn(
                    "absolute inset-0 h-2 w-2 animate-ping rounded-full opacity-75",
                    config.color,
                  )}
                />
              )}
              {status === "polling" && (
                <div className="absolute -inset-0.5">
                  <RefreshCw
                    strokeWidth={1.75}
                    className="h-3 w-3 animate-spin text-[color:var(--status-pending-fg)]"
                  />
                </div>
              )}
            </div>
            <Icon strokeWidth={1.75} className={cn("h-3.5 w-3.5", config.textColor)} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          <div className="flex flex-col gap-1">
            <span className="font-medium">{config.label}</span>
            <span className="text-xs text-muted-foreground">
              {config.description}
            </span>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
