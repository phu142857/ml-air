"use client";

import { useEffect, useState } from "react";
import { MlairLogo } from "@/components/brand/mlair-logo";
import { MetadataList, SettingsPage, SettingsPageHeader, SettingsSection } from "@/components/settings/enterprise";
import { getApiBaseUrl } from "@/lib/api";
import { getRuntimeConfig } from "@/lib/runtime-config";

export default function SettingsAboutPage() {
  const [env, setEnv] = useState("—");
  const [apiBase, setApiBase] = useState("—");

  useEffect(() => {
    setApiBase(getApiBaseUrl());
    const cfg = getRuntimeConfig();
    setEnv(String(cfg?.environment || "unknown"));
  }, []);

  return (
    <SettingsPage>
      <SettingsPageHeader
        title="About MLAir"
      />

      <SettingsSection id="brand" title="Brand">
        <div className="flex items-center gap-4">
          <MlairLogo size="lg" alt="MLAir logo" />
          <div className="min-w-0 space-y-1">
            <p className="font-heading text-sm font-semibold text-foreground">MLAir</p>
            <p className="text-xs text-muted-foreground">
              MLOps · Anywhere · Intelligent · Reliable
            </p>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection id="metadata" title="Metadata">
        <MetadataList
          items={[
            { label: "Product", value: "MLAir Hub (control plane)" },
            { label: "Environment", value: env, mono: true },
            { label: "API endpoint", value: `${apiBase}/v1`, mono: true },
            { label: "Frontend", value: "Next.js Hub UI", mono: true },
            { label: "License", value: "See repository LICENSE" },
            {
              label: "Documentation",
              value: (
                <a href="https://github.com" className="text-primary hover:underline" rel="noreferrer">
                  docs/guides
                </a>
              ),
            },
          ]}
        />
      </SettingsSection>
    </SettingsPage>
  );
}
