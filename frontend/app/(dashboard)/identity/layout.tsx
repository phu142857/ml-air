import { AdminRouteGuard } from "@/components/auth/admin-route-guard";
import { SettingsShell } from "@/components/settings/settings-shell";

export default function IdentityLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminRouteGuard>
      <SettingsShell>{children}</SettingsShell>
    </AdminRouteGuard>
  );
}
