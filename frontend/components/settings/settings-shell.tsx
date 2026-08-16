"use client";

import { PropsWithChildren } from "react";
import { AccountNav } from "@/components/settings/account-nav";

export function SettingsShell({ children }: PropsWithChildren) {
  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <AccountNav />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="scroll-region scroll-region-gutter min-h-0 min-w-0 flex-1">
          <div className="mx-auto w-full max-w-[1120px] px-4 py-6 sm:px-6">{children}</div>
        </div>
      </div>
    </div>
  );
}
