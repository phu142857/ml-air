"use client";

import { useEffect, useState } from "react";
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
        description="Product, deployment, and documentation references."
      />

      <SettingsSection id="metadata" title="Metadata" description="Read-only deployment information.">
        <MetadataList
          items={[
            { label: "Product", value: "ML-Air Hub (control plane)" },
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
