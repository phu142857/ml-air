"use client";

import { PropsWithChildren } from "react";
import { PageScrollBody } from "@/components/mlops/layout/page-scroll-body";
import { AccountNav } from "@/components/settings/account-nav";

export function SettingsShell({ children }: PropsWithChildren) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <AccountNav />
        <PageScrollBody
          variant="workspace"
          className="min-h-0 min-w-0 flex-1 gap-1 !px-1 !py-1 sm:!px-1"
        >
          <div className="scroll-region min-h-0 min-w-0 flex-1">{children}</div>
        </PageScrollBody>
      </div>
    </div>
  );
}
