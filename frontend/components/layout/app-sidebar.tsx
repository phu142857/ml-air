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
  SidebarFooter,
} from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"

type NavItem = {
  title: string
  href: string
  icon: typeof Database
}

const lifecycleNav: NavItem[] = [
  { title: "Datasets", href: "/datasets", icon: Database },
  { title: "Lifecycle", href: "/lifecycle", icon: History },
  { title: "Models", href: "/models", icon: Box },
]

const platformNav: NavItem[] = [
  { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { title: "Search", href: "/search", icon: Search },
]

const executionNav: NavItem[] = [
  { title: "Pipelines", href: "/pipelines", icon: GitBranch },
  { title: "Runs", href: "/runs", icon: Play },
  { title: "Tasks", href: "/tasks", icon: ListTodo },
  { title: "Lineage", href: "/lineage", icon: Network },
]

const settingsNav: NavItem[] = [
  { title: "Settings", href: "/settings", icon: Settings },
]

function NavGroup({ label, items }: { label: string; items: NavItem[] }) {
  const pathname = usePathname()
  return (
    <SidebarGroup>
      <SidebarGroupLabel className="px-4 text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)
            return (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton asChild isActive={isActive}>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 text-sm transition-colors",
                      isActive
                        ? "bg-muted/80 text-foreground"
                        : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                    )}
                  >
                    <item.icon
                      className={cn(
                        "h-4 w-4",
                        isActive ? "text-sky-400" : "text-muted-foreground",
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
  return (
    <Sidebar className="border-r border-border/50">
      <SidebarHeader className="border-b border-border/50 px-4 py-3">
        <Link href="/datasets" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-emerald-500">
            <Network className="h-4 w-4 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-foreground">ML-Air Hub</span>
            <span className="font-mono text-[10px] text-muted-foreground">lifecycle-first</span>
          </div>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <NavGroup label="Lifecycle" items={lifecycleNav} />
        <NavGroup label="Overview" items={platformNav} />
        <NavGroup label="Execution" items={executionNav} />
        <NavGroup label="Admin" items={settingsNav} />
      </SidebarContent>
      <SidebarFooter className="border-t border-border/50 p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
          <span>API Connected</span>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
