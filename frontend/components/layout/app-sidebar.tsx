"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Database,
  FlaskConical,
  GitBranch,
  History,
  ShieldCheck,
  Play,
  ListTodo,
  Search,
  Box,
  Network,
  LayoutDashboard,
  Route,
  Server,
} from "lucide-react"
import { MlairLogo } from "@/components/brand/mlair-logo"
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
import { useCanSeeExecutionNav } from "@/lib/hub-nav-access"
import { getRuntimeConfig } from "@/lib/runtime-config"

type NavItem = {
  title: string
  href: string
  icon: typeof Database
}

const lifecycleNav: NavItem[] = [
  { title: "Datasets", href: "/datasets", icon: Database },
  { title: "Lifecycle", href: "/lifecycle", icon: History },
  { title: "Approvals", href: "/governance/approvals", icon: ShieldCheck },
  { title: "Experiments", href: "/experiments", icon: FlaskConical },
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

function buildDistributedNav(): NavItem[] {
  const f = getRuntimeConfig()?.features ?? {}
  if (f.global_observability || f.multi_cluster || f.multi_region) {
    return [{ title: "Infrastructure", href: "/infra", icon: Server }]
  }
  return []
}

function NavGroup({ label, items }: { label: string; items: NavItem[] }) {
  const pathname = usePathname()
  return (
    <SidebarGroup className="px-1.5">
      <SidebarGroupLabel className="px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu className="gap-px">
          {items.map((item) => {
            const isActive =
              pathname === item.href ||
              pathname.startsWith(`${item.href}/`) ||
              (item.href === "/infra" && (pathname === "/clusters" || pathname.startsWith("/clusters/")))
            return (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton asChild isActive={isActive} tooltip={item.title}>
                  <Link href={item.href} aria-current={isActive ? "page" : undefined}>
                    <item.icon strokeWidth={1.75} />
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
  const distributedNav = buildDistributedNav()
  const showDistributedNav = distributedNav.length > 0
  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border bg-sidebar">
      <SidebarHeader className="border-b border-sidebar-border px-2 py-2.5 group-data-[collapsible=icon]:px-2 group-data-[collapsible=icon]:py-2">
        <Link
          href="/datasets"
          className="flex min-w-0 items-center gap-2 rounded-md px-1.5 py-1 transition-default hover:bg-sidebar-accent group-data-[collapsible=icon]:justify-center"
          aria-label="MLAir Hub home"
        >
          <MlairLogo size="sm" className="shrink-0" alt="" />
          <div className="flex min-w-0 flex-col group-data-[collapsible=icon]:hidden">
            <span className="font-heading truncate text-sm font-semibold tracking-tight text-foreground">
              MLAir Hub
            </span>
            <span className="truncate text-[10px] text-muted-foreground">
              MLOps control plane
            </span>
          </div>
        </Link>
      </SidebarHeader>
      <SidebarContent className="gap-0.5 py-2">
        <NavGroup label="Lifecycle" items={lifecycleNav} />
        <NavGroup label="Overview" items={platformNav} />
        {showExecutionNav ? (
          <NavGroup label="Execution" items={executionNav} />
        ) : null}
        {showDistributedNav ? (
          <NavGroup label="Distributed" items={distributedNav} />
        ) : null}
      </SidebarContent>
    </Sidebar>
  )
}
