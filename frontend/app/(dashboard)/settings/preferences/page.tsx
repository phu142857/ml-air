"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Save } from "lucide-react";
import { DetailSection } from "@/components/mlops/layout";
import { Button } from "@/components/ui/button";
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
    <div className="space-y-6">
      <DetailSection title="Appearance" description="How the Hub UI looks and feels." accentBorder="violet">
        <div className="space-y-3 max-w-xs">
          <Label className="text-xs">Theme</Label>
          <Select value={theme || "dark"} onValueChange={setTheme}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="light">Light</SelectItem>
              <SelectItem value="dark">Dark</SelectItem>
              <SelectItem value="system">System</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="mt-4 flex items-center justify-between gap-4 rounded-lg border border-border px-3 py-2 max-w-md">
          <div>
            <p className="text-xs font-medium">Compact density</p>
            <p className="text-[10px] text-muted-foreground">Tighter tables and panels (preview).</p>
          </div>
          <Switch
            checked={prefs.density === "compact"}
            onCheckedChange={(v) => setPrefs(saveUserPreferences({ density: v ? "compact" : "comfortable" }))}
          />
        </div>
      </DetailSection>

      <DetailSection title="Locale" description="Language and timezone preferences." accentBorder="sky">
        <div className="grid gap-3 sm:grid-cols-2 max-w-lg">
          <div>
            <Label className="text-xs">Language</Label>
            <Select
              value={prefs.language}
              onValueChange={(v) => setPrefs(saveUserPreferences({ language: v }))}
            >
              <SelectTrigger className="mt-1 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="vi">Tiếng Việt (preview)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Timezone</Label>
            <Input
              value={prefs.timezone}
              onChange={(e) => setPrefs({ ...prefs, timezone: e.target.value })}
              onBlur={() => saveUserPreferences({ timezone: prefs.timezone })}
              className="mt-1 h-8 font-mono text-xs"
            />
          </div>
        </div>
      </DetailSection>

      <DetailSection title="Workspace defaults" description="Preferred tenant and project when switching scope." accentBorder="amber">
        <div className="grid gap-3 sm:grid-cols-2 max-w-lg">
          <div>
            <Label className="text-xs">Default tenant</Label>
            <Select
              value={prefs.defaultTenant || tenantId}
              onValueChange={(v) => setPrefs(saveUserPreferences({ defaultTenant: v }))}
            >
              <SelectTrigger className="mt-1 h-8 text-xs font-mono">
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
          <div>
            <Label className="text-xs">Default project</Label>
            <Input
              value={prefs.defaultProject || projectId}
              onChange={(e) => setPrefs({ ...prefs, defaultProject: e.target.value })}
              onBlur={() => saveUserPreferences({ defaultProject: prefs.defaultProject })}
              className="mt-1 h-8 font-mono text-xs"
            />
          </div>
        </div>
        <p className="mt-2 text-[10px] text-muted-foreground">
          Active scope: {tenantId} / {projectId} — change from the top bar.
        </p>
      </DetailSection>

      <DetailSection
        title="Operator API override"
        description="Browser-local API base URL for split-host previews."
        accentBorder="none"
      >
        <div className="max-w-md space-y-2">
          <Label htmlFor="api-url" className="text-xs text-muted-foreground">
            API Base URL
          </Label>
          <Input
            id="api-url"
            value={apiBaseUrl}
            onChange={(e) => setApiBaseUrl(e.target.value)}
            className="font-mono text-xs"
          />
          <div className="flex flex-wrap gap-2 pt-2">
            <Button
              type="button"
              size="sm"
              className="gap-2"
              onClick={() => {
                const patch = { apiBaseUrl: apiBaseUrl.trim() };
                writeRuntimeConfigOverride(patch);
                applyRuntimeConfigPatch(patch);
                toast({ title: "Saved locally", description: "API base URL override for this browser." });
              }}
            >
              <Save className="h-3.5 w-3.5" />
              Save locally
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!hasLocalOverride}
              onClick={() => {
                clearRuntimeConfigOverride();
                window.location.reload();
              }}
            >
              Reset to deploy defaults
            </Button>
          </div>
        </div>
      </DetailSection>

      <DetailSection title="Experimental UI" description="Developer and design previews." accentBorder="violet">
        <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-3 py-2 max-w-md mb-4">
          <p className="text-xs font-medium">Show design tokens panel</p>
          <Switch
            checked={prefs.experimentalUi}
            onCheckedChange={(v) => setPrefs(saveUserPreferences({ experimentalUi: v }))}
          />
        </div>
        {prefs.experimentalUi ? (
          <DesignTokensSlide />
        ) : (
          <p className="text-sm text-muted-foreground">Enable to preview semantic palette tokens.</p>
        )}
      </DetailSection>
    </div>
  );
}
