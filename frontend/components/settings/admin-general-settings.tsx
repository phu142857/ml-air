"use client";

import { DetailSection } from "@/components/mlops/layout";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { HUB_ROUTES } from "@/lib/system-settings-api";
import { useAppContext } from "@/lib/app-context";
import {
  L4ErrorState,
  L4LoadingState,
  L4Meta,
  L4SaveBar,
} from "@/components/settings/l4-settings-ui";
import { partialFromForm, useL4SettingsForm } from "@/hooks/use-l4-settings-form";

export function AdminGeneralSettings() {
  const { token } = useAppContext();
  const { query, form, setForm, saveMutation, doc } = useL4SettingsForm(token);

  if (query.isLoading) return <L4LoadingState />;
  if (query.isError) return <L4ErrorState error={query.error} />;
  if (!form || !doc) return null;

  return (
    <DetailSection
      title="General"
      description="Platform-wide Hub defaults and branding placeholders."
      accentBorder="sky"
    >
      <L4Meta doc={doc} />
      <div className="mt-4 space-y-4">
        <div>
          <Label className="text-xs">Default Hub route</Label>
          <Select value={form.hubRoute} onValueChange={(v) => setForm({ ...form, hubRoute: v })}>
            <SelectTrigger className="mt-1 h-8 w-full max-w-xs text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HUB_ROUTES.map((route) => (
                <SelectItem key={route} value={route}>
                  {route}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="mt-1 text-[10px] text-muted-foreground">Landing page after sign-in for all users.</p>
        </div>
        <L4SaveBar
          saving={saveMutation.isPending}
          onSave={() => saveMutation.mutate(partialFromForm(form, ["hub"]))}
        />
      </div>
    </DetailSection>
  );
}
