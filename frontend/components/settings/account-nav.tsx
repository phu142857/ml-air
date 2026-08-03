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
  Users,
  Bot,
  ScrollText,
  Settings2,
  Server,
  Puzzle,
  Activity,
  Lock,
  ToggleLeft,
  FileCode2,
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
  { title: "Sessions", href: "/settings/sessions", icon: Monitor },
  { title: "CLI & API", href: "/settings/cli", icon: Terminal },
  { title: "Preferences", href: "/settings/preferences", icon: SlidersHorizontal },
];

const IDENTITY_NAV: NavLink[] = [
  { title: "Audit Logs", href: "/identity/dashboard", icon: ScrollText },
  { title: "Users", href: "/identity/users", icon: Users },
  { title: "Service Accounts", href: "/identity/service-accounts", icon: Bot },
  { title: "Sessions", href: "/identity/sessions", icon: Monitor },
];

const AUTH_POLICY_NAV: NavLink = {
  title: "Authentication Policy",
  href: "/identity/settings",
  icon: Lock,
};

const PLATFORM_NAV: NavLink[] = [
  { title: "General", href: "/identity/platform/general", icon: Settings2 },
  { title: "Features", href: "/identity/platform/features", icon: ToggleLeft },
  { title: "Runtime", href: "/identity/platform/runtime", icon: Server },
  { title: "Environment", href: "/identity/platform/environment", icon: FileCode2 },
  { title: "Integrations", href: "/identity/platform/integrations", icon: Puzzle },
  { title: "Observability", href: "/identity/platform/observability", icon: Activity },
];

function NavLinkItem({ item, active }: { item: NavLink; active: boolean }) {
  return (
    <Link
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
}

function NavSection({ label, items }: { label: string; items: NavLink[] }) {
  const pathname = usePathname();

  return (
    <div className="space-y-1">
      <p className="px-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/80">{label}</p>
      <nav className="space-y-0.5">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return <NavLinkItem key={item.href} item={item} active={active} />;
        })}
      </nav>
    </div>
  );
}

function NavSubSection({ label, items }: { label: string; items: NavLink[] }) {
  const pathname = usePathname();

  return (
    <div className="space-y-0.5">
      <p className="px-3 pt-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/60">{label}</p>
      <nav className="space-y-0.5">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return <NavLinkItem key={item.href} item={item} active={active} />;
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

  const identityItems = isGlobalAdmin ? [...IDENTITY_NAV, AUTH_POLICY_NAV] : IDENTITY_NAV;
  const showAdministration = showIdentityNav || isGlobalAdmin;

  return (
    <aside className="flex w-[220px] shrink-0 flex-col gap-4 border-r border-border bg-sidebar/40 p-3">
      <NavSection label="My Account" items={MY_ACCOUNT} />

      {showAdministration ? (
        <div className="space-y-1">
          <p className="px-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/80">
            Administration
          </p>
          <div className="space-y-2">
            {showIdentityNav ? <NavSubSection label="Identity" items={identityItems} /> : null}
            {isGlobalAdmin ? <NavSubSection label="Platform" items={PLATFORM_NAV} /> : null}
          </div>
        </div>
      ) : null}

      <div className="space-y-1">
        <p className="px-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/80">About</p>
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
