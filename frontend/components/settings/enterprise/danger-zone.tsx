import { SettingsSection } from "@/components/settings/enterprise/settings-section";

export function DangerZone({
  title = "Danger zone",
  description = "Irreversible and destructive actions.",
  children,
}: {
  title?: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <SettingsSection title={title} description={description}>
      <div className="space-y-4 rounded-md border border-destructive/25 bg-destructive/[0.04] p-4">{children}</div>
    </SettingsSection>
  );
}

export function DangerZoneAction({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border-t border-destructive/15 pt-4 first:border-t-0 first:pt-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}
