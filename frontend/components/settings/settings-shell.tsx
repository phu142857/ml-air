"use client";

import { PropsWithChildren } from "react";
import { Settings } from "lucide-react";
import { ResourcePageHeader } from "@/components/mlops/layout";
import { PageScrollBody } from "@/components/mlops/layout/page-scroll-body";
import { SettingsNav } from "@/components/settings/settings-nav";

export function SettingsShell({ children }: PropsWithChildren) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <ResourcePageHeader
        className="shrink-0"
        icon={Settings}
        accent="zinc"
        title="Settings"
        subtitle="Your account and platform configuration"
      />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <SettingsNav />
        <PageScrollBody variant="workspace" className="min-h-0 flex-1">
          <div className="scroll-region min-h-0 flex-1">
            <div className="flex min-h-0 flex-col gap-4">{children}</div>
          </div>
        </PageScrollBody>
      </div>
    </div>
  );
}
