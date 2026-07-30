"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DesignTokensSlide } from "@/components/mlops/design-tokens-slide";
import {
  LifecycleAction,
  SettingsFormFooter,
  SettingsPage,
  SettingsPageHeader,
  SettingsSection,
} from "@/components/settings/enterprise";
import {
  applyRuntimeConfigPatch,
  clearRuntimeConfigOverride,
  getRuntimeConfig,
  readRuntimeConfigOverride,
  writeRuntimeConfigOverride,
} from "@/lib/runtime-config";
import { loadUserPreferences, saveUserPreferences } from "@/lib/user-preferences";
import { useAppContext } from "@/lib/app-context";
import { useToast } from "@/hooks/use-toast";

export default function SettingsPreferencesPage() {
  const { theme, setTheme } = useTheme();
  const { tenantId, projectId, accessibleScopes } = useAppContext();
  const { toast } = useToast();
  const [prefs, setPrefs] = useState(loadUserPreferences);
  const [apiBaseUrl, setApiBaseUrl] = useState("/v1");
  const [apiDirty, setApiDirty] = useState(false);
  const hasLocalOverride = Boolean(readRuntimeConfigOverride());

  useEffect(() => {
    const cfg = getRuntimeConfig();
    if (cfg) {
      const a = String(cfg.apiBaseUrl || cfg.api_base_url || "").trim();
      if (a) setApiBaseUrl(a);
    }
  }, []);

  useEffect(() => {
    const onPrefs = () => setPrefs(loadUserPreferences());
    window.addEventListener("mlair-user-preferences-updated", onPrefs);
    return () => window.removeEventListener("mlair-user-preferences-updated", onPrefs);
  }, []);

  const tenantOptions = [...new Set(accessibleScopes.map((s) => s.tenant_id))];

  return (
    <SettingsPage>
      <SettingsPageHeader
        title="Preferences"
        description="Personal Hub experience — appearance, locale, and workspace defaults."
      />

      <SettingsSection id="appearance" title="Appearance" description="How the Hub UI looks and feels.">
        <div className="max-w-xs space-y-1.5">
          <Label>Theme</Label>
          <Select value={theme || "dark"} onValueChange={setTheme}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="system">System</SelectItem>
              <SelectItem value="light">Light</SelectItem>
              <SelectItem value="dark">Dark</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="mt-4 flex max-w-md items-center justify-between gap-4 rounded-md border border-border/60 px-4 py-3">
          <div>
            <p className="text-sm font-medium">Density</p>
            <p className="text-xs text-muted-foreground">
              {prefs.density === "compact" ? "Compact" : "Comfortable"} — tighter tables and panels.
            </p>
          </div>
          <Switch
            checked={prefs.density === "compact"}
            onCheckedChange={(v) => setPrefs(saveUserPreferences({ density: v ? "compact" : "comfortable" }))}
          />
        </div>
        <div className="mt-4 flex max-w-md items-center justify-between gap-4 rounded-md border border-border/60 px-4 py-3">
          <div>
            <p className="text-sm font-medium">Design tokens</p>
            <p className="text-xs text-muted-foreground">Developer preview of design system tokens.</p>
          </div>
          <Switch
            checked={prefs.experimentalUi}
            onCheckedChange={(v) => setPrefs(saveUserPreferences({ experimentalUi: v }))}
          />
        </div>
        {prefs.experimentalUi ? (
          <div className="mt-4">
            <DesignTokensSlide />
          </div>
        ) : null}
      </SettingsSection>

      <SettingsSection id="localization" title="Localization" description="Language and timezone preferences.">
        <div className="grid max-w-lg gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Language</Label>
            <Select value={prefs.language} onValueChange={(v) => setPrefs(saveUserPreferences({ language: v }))}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="vi">Tiếng Việt (preview)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="timezone">Timezone</Label>
            <Input
              id="timezone"
              value={prefs.timezone}
              onChange={(e) => setPrefs({ ...prefs, timezone: e.target.value })}
              onBlur={() => saveUserPreferences({ timezone: prefs.timezone })}
              className="h-9 font-mono text-sm"
            />
          </div>
        </div>
      </SettingsSection>

      <SettingsSection id="workspace" title="Workspace defaults" description="Preferred tenant and project when switching scope.">
        <div className="grid max-w-lg gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Default tenant</Label>
            <Select
              value={prefs.defaultTenant || tenantId}
              onValueChange={(v) => setPrefs(saveUserPreferences({ defaultTenant: v }))}
            >
              <SelectTrigger className="h-9 font-mono text-sm">
                <SelectValue placeholder={tenantId} />
              </SelectTrigger>
              <SelectContent>
                {tenantOptions.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="default-project">Default project</Label>
            <Input
              id="default-project"
              value={prefs.defaultProject || projectId}
              onChange={(e) => setPrefs({ ...prefs, defaultProject: e.target.value })}
              onBlur={() => saveUserPreferences({ defaultProject: prefs.defaultProject })}
              className="h-9 font-mono text-sm"
            />
          </div>
        </div>
      </SettingsSection>

      <SettingsSection id="advanced" title="Advanced" description="Technical overrides for this browser.">
        <div className="mb-4 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 text-sm text-muted-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
          <p>Changing this value can connect MLAir to a different API environment.</p>
        </div>
        <div className="max-w-md space-y-1.5">
          <Label htmlFor="api-url">API base URL</Label>
          <Input
            id="api-url"
            value={apiBaseUrl}
            onChange={(e) => {
              setApiBaseUrl(e.target.value);
              setApiDirty(true);
            }}
            className="h-9 font-mono text-sm"
          />
        </div>
        <SettingsFormFooter
          dirty={apiDirty}
          saveLabel="Save locally"
          onSave={() => {
            const patch = { apiBaseUrl: apiBaseUrl.trim() };
            writeRuntimeConfigOverride(patch);
            applyRuntimeConfigPatch(patch);
            setApiDirty(false);
            toast({ title: "Saved locally", description: "API base URL override for this browser." });
          }}
          onCancel={() => {
            const cfg = getRuntimeConfig();
            const a = String(cfg?.apiBaseUrl || cfg?.api_base_url || "/v1").trim();
            setApiBaseUrl(a);
            setApiDirty(false);
          }}
        />
        {hasLocalOverride ? (
          <div className="mt-4">
            <LifecycleAction
              title="Reset to default"
              description="Clears the browser override and reloads with server configuration."
              actionLabel="Reset to default"
              onAction={() => {
                clearRuntimeConfigOverride();
                window.location.reload();
              }}
            />
          </div>
        ) : null}
      </SettingsSection>
    </SettingsPage>
  );
}
