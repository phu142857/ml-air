import { StatusBadge } from "@/components/mlops/status-badge"
import { cn } from "@/lib/utils"

const accents = [
  {
    name: "Primary accent",
    hex: "#3B82F6",
    class: "border-primary/30 bg-primary/10 text-primary",
  },
  {
    name: "Success (status)",
    hex: "semantic",
    class:
      "border-[color:var(--status-success-border)] bg-[color:var(--status-success-bg)] text-[color:var(--status-success-fg)]",
  },
  {
    name: "Pending (status)",
    hex: "semantic",
    class:
      "border-[color:var(--status-pending-border)] bg-[color:var(--status-pending-bg)] text-[color:var(--status-pending-fg)]",
  },
  {
    name: "Failed (status)",
    hex: "semantic",
    class:
      "border-[color:var(--status-failed-border)] bg-[color:var(--status-failed-bg)] text-[color:var(--status-failed-fg)]",
  },
  {
    name: "Neutral",
    hex: "#71717a",
    class: "border-border/60 bg-muted/30 text-muted-foreground",
  },
]

const spacing = [
  { token: "page-header", value: "px-4 py-5 sm:px-6", use: "ResourcePageHeader shell" },
  { token: "page-body", value: "p-4 sm:p-6", use: "List & detail content" },
  { token: "page-toolbar", value: "px-4 py-3 sm:px-6", use: "Filters, stats strip" },
  { token: "gap-sm", value: "gap-2", use: "Chips, inline controls" },
  { token: "gap-md", value: "gap-4", use: "Metadata grid, form fields" },
  { token: "gap-lg", value: "gap-6", use: "Section stacks" },
]

const surfaces = [
  { name: "Ambient canvas", class: "ambient-canvas", border: "—" },
  { name: "Bezel shell", class: "bezel-shell", border: "border-border/60" },
  { name: "Panel surface", class: "panel-surface", border: "border-border/60" },
  { name: "Glass panel", class: "glass-panel", border: "border-border/40" },
]

const semanticTokens = [
  { token: "--background", use: "Page shell, sidebar inset" },
  { token: "--primary", use: "Electric blue accent, links, running state" },
  { token: "--card", use: "Panels, tables, dialogs" },
  { token: "--muted", use: "Subtle fills, hover rows" },
  { token: "--border", use: "Dividers, inputs, charts grid" },
  { token: "--foreground", use: "Primary text" },
  { token: "--muted-foreground", use: "Labels, meta, axis ticks" },
]

export function DesignTokensSlide() {
  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <section className="bezel-shell overflow-hidden">
        <div className="bezel-inner p-8">
          <p className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">Theme</p>
          <h2 className="mb-2 text-xl font-semibold tracking-tight text-foreground">
            Light & dark via CSS variables
          </h2>
          <p className="mb-6 text-sm text-muted-foreground">
            Toggle with the sun/moon control in the top bar. Tokens live in{" "}
            <code className="rounded bg-muted px-1 font-mono text-xs">app/globals.css</code>{" "}
            — Outfit + single primary accent, bezel surfaces.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {semanticTokens.map((t) => (
              <div key={t.token} className="panel-surface p-3">
                <p className="font-mono text-xs text-primary">{t.token}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t.use}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bezel-shell overflow-hidden">
        <div className="bezel-inner p-8">
          <p className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">
            Accent & status
          </p>
          <h2 className="mb-6 text-xl font-semibold tracking-tight text-foreground">
            Primary + semantic operational colors
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {accents.map((a) => (
              <div key={a.name} className={cn("rounded-xl border p-4", a.class)}>
                {a.hex !== "semantic" ? (
                  <div
                    className="mb-3 h-8 w-8 rounded-md border border-border/60"
                    style={{ backgroundColor: a.hex }}
                  />
                ) : (
                  <div className="mb-3 h-8 w-8 rounded-md border border-border/60 bg-muted/40" />
                )}
                <p className="text-sm font-medium">{a.name}</p>
                {a.hex !== "semantic" ? (
                  <p className="mt-1 font-mono text-[10px] text-muted-foreground">{a.hex}</p>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bezel-shell overflow-hidden">
        <div className="bezel-inner p-8">
          <p className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">
            Status mapping
          </p>
          <h2 className="mb-6 text-xl font-semibold tracking-tight text-foreground">
            Operational states
          </h2>
          <div className="mb-6 flex flex-wrap gap-3">
            <StatusBadge status="success" />
            <StatusBadge status="running" />
            <StatusBadge status="failed" />
            <StatusBadge status="pending" />
            <StatusBadge status="cancelled" />
            <StatusBadge status="warning" />
          </div>
          <div className="grid grid-cols-2 gap-3 font-mono text-xs text-muted-foreground md:grid-cols-3">
            <div className="rounded-xl border border-border/60 p-3">success → --status-success-*</div>
            <div className="rounded-xl border border-border/60 p-3">running → primary + spin</div>
            <div className="rounded-xl border border-border/60 p-3">failed → --status-failed-*</div>
            <div className="rounded-xl border border-border/60 p-3">pending → --status-pending-*</div>
            <div className="rounded-xl border border-border/60 p-3">neutral → muted</div>
          </div>
        </div>
      </section>

      <section className="bezel-shell overflow-hidden">
        <div className="bezel-inner p-8">
          <p className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">
            Spacing & surfaces
          </p>
          <h2 className="mb-6 text-xl font-semibold tracking-tight text-foreground">Layout scale</h2>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="pb-2">Token</th>
                  <th className="pb-2">Tailwind</th>
                  <th className="pb-2">Usage</th>
                </tr>
              </thead>
              <tbody className="text-foreground/90">
                {spacing.map((row) => (
                  <tr key={row.token} className="border-b border-border/80">
                    <td className="py-2 font-mono text-xs text-primary">{row.token}</td>
                    <td className="py-2 font-mono text-xs">{row.value}</td>
                    <td className="py-2 text-xs text-muted-foreground">{row.use}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="space-y-3">
              {surfaces.map((s) => (
                <div
                  key={s.name}
                  className={cn(
                    "rounded-xl border p-4",
                    s.border !== "—" ? s.border : "border-border/60",
                    s.class,
                  )}
                >
                  <p className="text-sm text-foreground">{s.name}</p>
                  <p className="mt-1 font-mono text-[10px] text-muted-foreground">{s.class}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
