import { RouteShell } from "@/components/layout/route-shell"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <RouteShell>{children}</RouteShell>
}
