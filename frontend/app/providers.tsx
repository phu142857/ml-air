"use client";

import { PropsWithChildren } from "react";
import { QueryProvider } from "@/lib/query-provider";
import { AppContextProvider } from "@/lib/app-context";

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <AppContextProvider>
      <QueryProvider>{children}</QueryProvider>
    </AppContextProvider>
  );
}
