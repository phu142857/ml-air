import { GlobalAdminRouteGuard } from "@/components/auth/global-admin-route-guard";

export default function SettingsAdminLayout({ children }: { children: React.ReactNode }) {
  return <GlobalAdminRouteGuard>{children}</GlobalAdminRouteGuard>;
}
