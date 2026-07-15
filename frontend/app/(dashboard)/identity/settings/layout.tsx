import { GlobalAdminRouteGuard } from "@/components/auth/global-admin-route-guard";

export default function IdentitySettingsLayout({ children }: { children: React.ReactNode }) {
  return <GlobalAdminRouteGuard>{children}</GlobalAdminRouteGuard>;
}
