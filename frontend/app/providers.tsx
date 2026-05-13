"use client";

import { PropsWithChildren, useEffect } from "react";
import { QueryProvider } from "@/lib/query-provider";
import { AppContextProvider } from "@/lib/app-context";
import { ThemeProvider } from "@/lib/theme-context";
import { Topbar } from "@/components/layout/topbar";
import { CommandPalette } from "@/components/layout/command-palette";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useMlairRealtime } from "@/lib/use-mlair-realtime";
import { fetchRuntimeConfig } from "@/lib/api";

function MlairRealtimeSubscriber() {
  useMlairRealtime();
  return null;
}

export function AppProviders({ children }: PropsWithChildren) {
  // Best-effort: if deploy did not inject `window.__ML_AIR_RUNTIME_CONFIG__`,
  // try to load runtime config from the same origin (reverse-proxy setups).
  useEffect(() => {
    const g = window as any;
    const existing = String(g?.__ML_AIR_RUNTIME_CONFIG__?.api_base_url || "").trim();
    if (existing) return;
    (async () => {
      try {
        const rc = await fetchRuntimeConfig({ preferRelative: true });
        g.__ML_AIR_RUNTIME_CONFIG__ = { ...(g.__ML_AIR_RUNTIME_CONFIG__ || {}), ...(rc || {}) };
      } catch {
        // ignore: env/build-time config fallback remains
      }
    })();
  }, []);

  return (
    <ThemeProvider>
      <TooltipProvider delayDuration={200}>
        <AppContextProvider>
          <Topbar />
          <CommandPalette />
          <QueryProvider>
            <MlairRealtimeSubscriber />
            {children}
          </QueryProvider>
        </AppContextProvider>
      </TooltipProvider>
    </ThemeProvider>
  );
}
