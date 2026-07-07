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
import { Panel } from "@/components/ui/panel"
import { cn } from "@/lib/utils"
import { useCanSeeExecutionNav } from "@/lib/hub-nav-access"

type NavItem = {
  title: string
  href: string
  icon: typeof Database
}

const lifecycleNav: NavItem[] = [
  { title: "Datasets", href: "/datasets", icon: Database },
  { title: "Lifecycle", href: "/lifecycle", icon: History },
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
  { title: "Settings", href: "/settings", icon: Settings },
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
                      "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-premium",
                      isActive
                        ? "nav-active-rail bg-sidebar-accent text-foreground shadow-whisper"
                        : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
                    )}
                  >
                    <item.icon
                      strokeWidth={1.75}
                      className={cn(
                        "h-4 w-4 shrink-0 transition-premium",
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
  return (
    <Sidebar className="border-r border-sidebar-border/80 bg-sidebar">
      <SidebarHeader className="border-b border-sidebar-border/70 px-3 py-4">
        <Link href="/datasets" className="group flex items-center gap-3">
          <div className="rounded-xl bg-muted/40 p-1 ring-1 ring-border/60">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary shadow-whisper">
              <Network
                strokeWidth={1.75}
                className="h-4 w-4 text-primary-foreground"
              />
            </div>
          </div>
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-semibold tracking-tight text-foreground">
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
        <NavGroup label="Admin" items={settingsNav} />
      </SidebarContent>
    </Sidebar>
  )
}
