import { GlobalAdminRouteGuard } from "@/components/auth/global-admin-route-guard";

export default function IdentityPlatformLayout({ children }: { children: React.ReactNode }) {
  return <GlobalAdminRouteGuard>{children}</GlobalAdminRouteGuard>;
}
