"use client";

import { useState } from "react";
import { Puzzle } from "lucide-react";

import { IntegrationSubscriptionsPanel } from "@/components/settings/integration-subscriptions-panel";
import { PluginsSettingsTab } from "@/components/settings/plugins-settings-tab";
import { DetailTabList } from "@/components/mlops/layout";
import { Tabs, TabsContent } from "@/components/ui/tabs";

const HUB_TABS = [
  { id: "plugins", label: "Plugins" },
  { id: "subscriptions", label: "Subscriptions" },
] as const;

export function IntegrationsHub() {
  const [tab, setTab] = useState("plugins");

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-border px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2">
          <Puzzle className="size-5 text-muted-foreground" />
          <div>
            <h1 className="text-lg font-semibold">Integrations</h1>
            <p className="text-xs text-muted-foreground">Plugins, webhooks, and external tool connectors</p>
          </div>
        </div>
      </div>
      <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <DetailTabList accent="violet" tabs={[...HUB_TABS]} className="shrink-0 px-4 sm:px-6" />
        <TabsContent value="plugins" className="mt-0 min-h-0 flex-1 overflow-hidden data-[state=inactive]:hidden">
          <PluginsSettingsTab embedded />
        </TabsContent>
        <TabsContent value="subscriptions" className="mt-0 flex-1 overflow-auto px-4 py-4 sm:px-6">
          <IntegrationSubscriptionsPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
