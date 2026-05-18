"use client";

import { PropsWithChildren, useEffect } from "react";
import { QueryProvider } from "@/lib/query-provider";
import { AppContextProvider } from "@/lib/app-context";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useMlairRealtime } from "@/lib/use-mlair-realtime";
import { fetchRuntimeConfig } from "@/lib/api";
import { hydrateRuntimeConfigOverride } from "@/lib/runtime-config";

function MlairRealtimeSubscriber() {
  useMlairRealtime();
  return null;
}

export function AppProviders({ children }: PropsWithChildren) {
  // Best-effort: if deploy did not inject `window.__ML_AIR_RUNTIME_CONFIG__`,
  // try to load runtime config from the same origin (reverse-proxy setups).
  useEffect(() => {
    hydrateRuntimeConfigOverride();
    const g = window as Window & {
      __ML_AIR_RUNTIME_CONFIG__?: Record<string, unknown> & {
        features?: Record<string, boolean>;
      };
    };
    (async () => {
      try {
        const rc = await fetchRuntimeConfig({ preferRelative: true });
        const prev = g.__ML_AIR_RUNTIME_CONFIG__ || {};
        g.__ML_AIR_RUNTIME_CONFIG__ = {
          ...prev,
          ...(rc || {}),
          features: {
            ...(prev.features || {}),
            ...(rc?.features || {}),
            realtime_enabled: rc?.features?.realtime_enabled !== false,
          },
        };
      } catch {
        // env / mlair-runtime-config.js fallback remains
      } finally {
        hydrateRuntimeConfigOverride();
        window.dispatchEvent(new Event("mlair-runtime-config-updated"));
      }
    })();
  }, []);

  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem storageKey="ml-air-theme">
      <TooltipProvider delayDuration={200}>
        <AppContextProvider>
          <QueryProvider>
            <MlairRealtimeSubscriber />
            {children}
          </QueryProvider>
        </AppContextProvider>
      </TooltipProvider>
    </ThemeProvider>
  );
}
