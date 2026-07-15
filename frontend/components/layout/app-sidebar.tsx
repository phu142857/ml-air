"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Database,
  GitBranch,
  Play,
  ListTodo,
  Search,
  History,
  Box,
  Network,
  Settings,
  LayoutDashboard,
  Route,
  Users,
  Shield,
} from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"
import { useCanSeeExecutionNav, useCanSeeAdminNav } from "@/lib/hub-nav-access"
import { useAppContext } from "@/lib/app-context"

type NavItem = {
  title: string
  href: string
  icon: typeof Database
}

const lifecycleNav: NavItem[] = [
  { title: "Datasets", href: "/datasets", icon: Database },
  { title: "Lifecycle", href: "/lifecycle", icon: History },
  { title: "Traces", href: "/traces", icon: Route },
  { title: "Models", href: "/models", icon: Box },
  { title: "Lineage", href: "/lineage", icon: Network },
]

const platformNav: NavItem[] = [
  { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { title: "Search", href: "/search", icon: Search },
]

const executionNav: NavItem[] = [
  { title: "Pipelines", href: "/pipelines", icon: GitBranch },
  { title: "Runs", href: "/runs", icon: Play },
  { title: "Tasks", href: "/tasks", icon: ListTodo },
]

const settingsNav: NavItem[] = [
  { title: "Settings", href: "/settings/profile", icon: Settings },
]

const administrationNav: NavItem[] = [
  { title: "Users", href: "/admin/users", icon: Users },
  { title: "Service accounts", href: "/admin/service-accounts", icon: Shield },
  { title: "Identity audit", href: "/admin/audit", icon: Shield },
  { title: "System settings", href: "/settings/admin/general", icon: Settings },
]

function NavGroup({ label, items }: { label: string; items: NavItem[] }) {
  const pathname = usePathname()
  return (
    <SidebarGroup className="px-2">
      <SidebarGroupLabel className="px-3 text-[11px] font-medium tracking-wide text-muted-foreground/80">
        {label}
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu className="gap-0.5">
          {items.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(`${item.href}/`)
            return (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton asChild isActive={isActive}>
                  <Link
                    href={item.href}
                    className={cn(
                      "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-default",
                      isActive
                        ? "nav-active-rail bg-sidebar-accent text-foreground"
                        : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
                    )}
                  >
                    <item.icon
                      strokeWidth={1.75}
                      className={cn(
                        "h-4 w-4 shrink-0 transition-default",
                        isActive
                          ? "text-primary"
                          : "text-muted-foreground group-hover:text-foreground",
                      )}
                    />
                    <span>{item.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

export function AppSidebar() {
  const showExecutionNav = useCanSeeExecutionNav()
  const showAdminNav = useCanSeeAdminNav()
  const { isGlobalAdmin } = useAppContext()
  const adminItems = isGlobalAdmin
    ? administrationNav
    : administrationNav.filter((item) => item.href !== "/settings/admin/general")
  return (
    <Sidebar className="border-r border-sidebar-border bg-sidebar">
      <SidebarHeader className="border-b border-sidebar-border px-3 py-4">
        <Link href="/datasets" className="group flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
            <Network
              strokeWidth={1.75}
              className="h-4 w-4 text-primary-foreground"
            />
          </div>
          <div className="flex min-w-0 flex-col">
            <span className="font-heading truncate text-sm font-semibold tracking-tight text-foreground">
              ML-Air Hub
            </span>
            <span className="font-mono text-[10px] text-muted-foreground">
              lifecycle-first
            </span>
          </div>
        </Link>
      </SidebarHeader>
      <SidebarContent className="gap-1 py-3">
        <NavGroup label="Lifecycle" items={lifecycleNav} />
        <NavGroup label="Overview" items={platformNav} />
        {showExecutionNav ? (
          <NavGroup label="Execution" items={executionNav} />
        ) : null}
        {showAdminNav ? <NavGroup label="Administration" items={adminItems} /> : null}
        <NavGroup label="Account" items={settingsNav} />
      </SidebarContent>
    </Sidebar>
  )
}
