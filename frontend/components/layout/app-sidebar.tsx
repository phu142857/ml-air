"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Activity,
  Bot,
  Database,
  DollarSign,
  FileText,
  FlaskConical,
  GitBranch,
  Play,
  ListTodo,
  Search,
  History,
  Box,
  Network,
  LayoutDashboard,
  Route,
  Globe,
  Server,
  Sparkles,
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
import { cn } from "@/lib/utils"
import { useCanSeeExecutionNav } from "@/lib/hub-nav-access"
import { hasAnyControlPlaneSurface, useControlPlaneFeatures } from "@/lib/use-control-plane-features"
import { getRuntimeConfig } from "@/lib/runtime-config"

type NavItem = {
  title: string
  href: string
  icon: typeof Database
}

const lifecycleNav: NavItem[] = [
  { title: "Datasets", href: "/datasets", icon: Database },
  { title: "Activity", href: "/activity", icon: Activity },
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

function buildDistributedNav(): NavItem[] {
  const f = getRuntimeConfig()?.features ?? {}
  const items: NavItem[] = []
  if (f.global_observability) items.push({ title: "Global", href: "/global", icon: Globe })
  if (f.multi_cluster || f.multi_region) items.push({ title: "Clusters", href: "/clusters", icon: Server })
  return items
}

function buildControlPlaneNav(flags: ReturnType<typeof useControlPlaneFeatures>): NavItem[] {
  const items: NavItem[] = []
  if (flags.aiGateway) items.push({ title: "AI Gateway", href: "/ai-gateway", icon: Bot })
  if (flags.chargeback) items.push({ title: "Billing", href: "/billing", icon: DollarSign })
  if (flags.promptManagement) items.push({ title: "Prompts", href: "/prompts", icon: FileText })
  if (flags.copilot) items.push({ title: "Copilot", href: "/copilot", icon: Sparkles })
  items.push({ title: "AutoML", href: "/automl", icon: FlaskConical })
  return items
}

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
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)
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
  const cpFlags = useControlPlaneFeatures()
  const controlPlaneNav = buildControlPlaneNav(cpFlags)
  const distributedNav = buildDistributedNav()
  const showControlPlaneNav = hasAnyControlPlaneSurface(cpFlags) || controlPlaneNav.length > 0
  const showDistributedNav = distributedNav.length > 0
  return (
    <Sidebar className="border-r border-sidebar-border bg-sidebar">
      <SidebarHeader className="border-b border-sidebar-border px-3 py-4">
        <Link href="/datasets" className="group flex min-w-0 items-center gap-2.5">
          <MlairLogo size="sm" className="shrink-0" alt="" />
          <div className="flex min-w-0 flex-col">
            <span className="font-heading truncate text-sm font-semibold tracking-tight text-foreground">
              MLAir Hub
            </span>
            <span className="truncate text-[10px] tracking-wide text-muted-foreground">
              MLOps · Anywhere
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
        {showControlPlaneNav ? (
          <NavGroup label="AI Control Plane" items={controlPlaneNav} />
        ) : null}
        {showDistributedNav ? (
          <NavGroup label="Distributed" items={distributedNav} />
        ) : null}
      </SidebarContent>
    </Sidebar>
  )
}
