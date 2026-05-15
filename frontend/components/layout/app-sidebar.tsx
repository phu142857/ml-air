"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Database,
  GitBranch,
  Play,
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

const navItems = [
  {
    title: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    title: "Datasets",
    href: "/datasets",
    icon: Database,
  },
  {
    title: "Pipelines",
    href: "/pipelines",
    icon: GitBranch,
  },
  {
    title: "Runs",
    href: "/runs",
    icon: Play,
  },
  {
    title: "Lifecycle",
    href: "/lifecycle",
    icon: History,
  },
  {
    title: "Models",
    href: "/models",
    icon: Box,
  },
  {
    title: "Lineage",
    href: "/lineage",
    icon: Network,
  },
  {
    title: "Settings",
    href: "/settings",
    icon: Settings,
  },
]

export function AppSidebar() {
  const pathname = usePathname()

  return (
    <Sidebar className="border-r border-zinc-800/50">
      <SidebarHeader className="border-b border-zinc-800/50 px-4 py-3">
        <Link href="/datasets" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-emerald-500">
            <Network className="h-4 w-4 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-zinc-100">ML-Air Hub</span>
            <span className="text-[10px] text-zinc-500 font-mono">v1.0.0</span>
          </div>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-zinc-500 text-[10px] uppercase tracking-wider px-4">
            Navigation
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={isActive}>
                      <Link
                        href={item.href}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2 text-sm transition-colors",
                          isActive
                            ? "text-zinc-100 bg-zinc-800/50"
                            : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/30"
                        )}
                      >
                        <item.icon className={cn(
                          "h-4 w-4",
                          isActive ? "text-sky-400" : "text-zinc-500"
                        )} />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-zinc-800/50 p-4">
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>API Connected</span>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
