"use client";

import { PropsWithChildren } from "react";
import { QueryProvider } from "@/lib/query-provider";
import { AppContextProvider } from "@/lib/app-context";
import { ThemeProvider } from "@/lib/theme-context";

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <ThemeProvider>
      <AppContextProvider>
        <QueryProvider>{children}</QueryProvider>
      </AppContextProvider>
    </ThemeProvider>
  );
}
