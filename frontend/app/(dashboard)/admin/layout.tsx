import { AdminRouteGuard } from "@/components/auth/admin-route-guard";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminRouteGuard>{children}</AdminRouteGuard>;
}
