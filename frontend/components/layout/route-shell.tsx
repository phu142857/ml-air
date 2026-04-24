"use client";

import Link from "next/link";
import { PropsWithChildren } from "react";

type NavItem = "Dashboard" | "Pipelines" | "Runs" | "Tasks" | "Settings";

type Props = PropsWithChildren<{
  activeNav: NavItem;
  title: string;
  subtitle: string;
}>;

const navItems: Array<{ key: NavItem; href: string }> = [
  { key: "Dashboard", href: "/dashboard" },
  { key: "Pipelines", href: "/pipelines" },
  { key: "Runs", href: "/runs" },
  { key: "Tasks", href: "/tasks" },
  { key: "Settings", href: "/settings" }
];

export function RouteShell({ activeNav, title, subtitle, children }: Props) {
  return (
    <div className="min-h-screen bg-bg-main text-slate-100">
      <header className="flex h-16 items-center justify-between border-b border-slate-700 bg-bg-muted px-6">
        <div className="flex items-center gap-3">
          <div className="text-lg font-semibold">ML-AIR</div>
          <input className="w-80 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm" placeholder="Search pipeline, run, task..." />
        </div>
        <div className="text-xs text-slate-400">default/default_project</div>
      </header>

      <div className="grid min-h-[calc(100vh-64px)] grid-cols-[220px_1fr]">
        <aside className="border-r border-slate-700 bg-bg-muted p-4">
          <div className="mb-3 text-xs uppercase tracking-wide text-slate-400">Navigation</div>
          <div className="space-y-2">
            {navItems.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                className={`block w-full rounded-xl px-3 py-2 text-left text-sm ${
                  activeNav === item.key ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-200 hover:bg-slate-700"
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
              <h1 className="text-2xl font-semibold">{title}</h1>
              <p className="text-sm text-slate-400">{subtitle}</p>
            </div>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
