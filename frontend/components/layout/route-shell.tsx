"use client";

import Link from "next/link";
import { PropsWithChildren } from "react";
import { Topbar } from "./topbar";

type NavItem = "Dashboard" | "Pipelines" | "Runs" | "Lineage" | "Models" | "Datasets" | "Tasks" | "Settings";

type Props = PropsWithChildren<{
  activeNav: NavItem;
  title: string;
  subtitle: string;
}>;

const navItems: Array<{ key: NavItem; href: string }> = [
  { key: "Dashboard", href: "/dashboard" },
  { key: "Pipelines", href: "/pipelines" },
  { key: "Runs", href: "/runs" },
  { key: "Lineage", href: "/lineage" },
  { key: "Models", href: "/models" },
  { key: "Datasets", href: "/datasets" },
  { key: "Tasks", href: "/tasks" },
  { key: "Settings", href: "/settings" }
];

export function RouteShell({ activeNav, title, subtitle, children }: Props) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Topbar />

      <div className="grid min-h-[calc(100vh-64px)] grid-cols-[220px_1fr]">
        <aside className="border-r border-border bg-muted p-4">
          <div className="mb-3 text-overline uppercase tracking-wide text-muted-foreground">Navigation</div>
          <div className="space-y-2">
            {navItems.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                className={`block w-full rounded-xl border border-transparent px-3 py-2 text-left text-body transition-colors ${
                  activeNav === item.key
                    ? "border-transparent bg-primary text-primary-foreground"
                    : "border-border bg-card text-foreground hover:bg-secondary"
                }`}
              >
                {item.key}
              </Link>
            ))}
          </div>
        </aside>

        <main className="p-6">
          <div className="mx-auto flex max-w-[1400px] flex-col gap-6">
            <div>
              <h1 className="text-page font-semibold tracking-tight text-foreground">{title}</h1>
              <p className="text-body text-muted-foreground">{subtitle}</p>
            </div>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
