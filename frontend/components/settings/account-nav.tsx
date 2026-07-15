"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  User,
  Shield,
  Monitor,
  Terminal,
  SlidersHorizontal,
  Info,
  LayoutDashboard,
  Users,
  Bot,
  ScrollText,
  Settings2,
  Server,
  Puzzle,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppContext } from "@/lib/app-context";
import { useCanSeeAdminNav } from "@/lib/hub-nav-access";

type NavLink = {
  title: string;
  href: string;
  icon: typeof User;
};

const MY_ACCOUNT: NavLink[] = [
  { title: "Profile", href: "/settings/profile", icon: User },
  { title: "Security", href: "/settings/security", icon: Shield },
  { title: "My sessions", href: "/settings/sessions", icon: Monitor },
  { title: "CLI Authentication", href: "/settings/cli", icon: Terminal },
  { title: "Preferences", href: "/settings/preferences", icon: SlidersHorizontal },
];

const IDENTITY_NAV: NavLink[] = [
  { title: "Dashboard", href: "/identity/dashboard", icon: LayoutDashboard },
  { title: "Users", href: "/identity/users", icon: Users },
  { title: "Service Accounts", href: "/identity/service-accounts", icon: Bot },
  { title: "Roles", href: "/identity/roles", icon: Shield },
  { title: "Sessions", href: "/identity/sessions", icon: Monitor },
  { title: "Audit Logs", href: "/identity/audit", icon: ScrollText },
  { title: "Policy", href: "/identity/settings", icon: SlidersHorizontal },
];

const PLATFORM_NAV: NavLink[] = [
  { title: "General", href: "/identity/platform/general", icon: Settings2 },
  { title: "Runtime", href: "/identity/platform/runtime", icon: Server },
  { title: "Integrations", href: "/identity/platform/integrations", icon: Puzzle },
  { title: "Observability", href: "/identity/platform/observability", icon: Activity },
];

function NavSection({ label, items }: { label: string; items: NavLink[] }) {
  const pathname = usePathname();

  return (
    <div className="space-y-1">
      <p className="px-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/80">{label}</p>
      <nav className="space-y-0.5">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-default",
                active
                  ? "bg-sidebar-accent text-foreground nav-active-rail"
                  : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
              )}
            >
              <item.icon strokeWidth={1.75} className={cn("h-4 w-4 shrink-0", active ? "text-primary" : "")} />
              <span className="truncate">{item.title}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export function AccountNav() {
  const pathname = usePathname();
  const showIdentityNav = useCanSeeAdminNav();
  const { isGlobalAdmin } = useAppContext();
  const aboutActive = pathname === "/settings/about";

  return (
    <aside className="flex w-[220px] shrink-0 flex-col gap-4 border-r border-border bg-sidebar/40 p-3">
      <NavSection label="My Account" items={MY_ACCOUNT} />
      {showIdentityNav ? <NavSection label="Identity" items={IDENTITY_NAV} /> : null}
      {isGlobalAdmin ? <NavSection label="Platform" items={PLATFORM_NAV} /> : null}
      <div className="space-y-1">
        <p className="px-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/80">Info</p>
        <Link
          href="/settings/about"
          className={cn(
            "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-default",
            aboutActive
              ? "bg-sidebar-accent text-foreground nav-active-rail"
              : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
          )}
        >
          <Info strokeWidth={1.75} className={cn("h-4 w-4 shrink-0", aboutActive ? "text-primary" : "")} />
          About
        </Link>
      </div>
    </aside>
  );
}

/** @deprecated Use AccountNav */
export const SettingsNav = AccountNav;
