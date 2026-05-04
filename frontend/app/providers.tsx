"use client";

import { PropsWithChildren } from "react";
import { QueryProvider } from "@/lib/query-provider";
import { AppContextProvider } from "@/lib/app-context";
import { ThemeProvider } from "@/lib/theme-context";
import { useMlairRealtime } from "@/lib/use-mlair-realtime";

function MlairRealtimeSubscriber() {
  useMlairRealtime();
  return null;
}

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <ThemeProvider>
      <AppContextProvider>
        <QueryProvider>
          <MlairRealtimeSubscriber />
          {children}
        </QueryProvider>
      </AppContextProvider>
    </ThemeProvider>
  );
}
