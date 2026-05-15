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

  // Simulate connection status changes for demo
  useEffect(() => {
    const statuses: ConnectionStatus[] = ["connected", "polling", "disconnected"]
    let index = 0
    
    // For demo, cycle through statuses every 30 seconds
    const interval = setInterval(() => {
      index = (index + 1) % statuses.length
      // Keep connected most of the time
      setStatus(Math.random() > 0.1 ? "connected" : statuses[index])
    }, 30000)

    return () => clearInterval(interval)
  }, [])

  const statusConfig = {
    connected: {
      icon: Wifi,
      label: "WebSocket Connected",
      description: "Real-time updates active",
      color: "bg-emerald-500",
      textColor: "text-emerald-400",
    },
    polling: {
      icon: RefreshCw,
      label: "Polling Mode",
      description: "WebSocket unavailable, using polling fallback",
      color: "bg-amber-500",
      textColor: "text-amber-400",
    },
    disconnected: {
      icon: WifiOff,
      label: "Disconnected",
      description: "Unable to connect to real-time service",
      color: "bg-red-500",
      textColor: "text-red-400",
    },
  }

  const config = statusConfig[status]
  const Icon = config.icon

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-zinc-800/50 transition-colors">
            <div className="relative">
              <div
                className={cn(
                  "h-2 w-2 rounded-full",
                  config.color
                )}
              />
              {status === "connected" && (
                <div
                  className={cn(
                    "absolute inset-0 h-2 w-2 rounded-full",
                    config.color,
                    "animate-ping opacity-75"
                  )}
                />
              )}
              {status === "polling" && (
                <div className="absolute -inset-0.5">
                  <RefreshCw className="h-3 w-3 text-amber-400 animate-spin" />
                </div>
              )}
            </div>
            <Icon className={cn("h-3.5 w-3.5", config.textColor)} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          <div className="flex flex-col gap-1">
            <span className="font-medium">{config.label}</span>
            <span className="text-xs text-zinc-400">{config.description}</span>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
