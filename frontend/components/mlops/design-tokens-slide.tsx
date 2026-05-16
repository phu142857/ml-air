import { StatusBadge } from "@/components/mlops/status-badge"
import { cn } from "@/lib/utils"

const accents = [
  { name: "Datasets", hex: "#34d399", class: "from-emerald-500/20 to-emerald-600/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400" },
  { name: "Pipelines", hex: "#fbbf24", class: "from-amber-500/20 to-amber-600/10 border-amber-500/30 text-amber-600 dark:text-amber-400" },
  { name: "Runs / Search", hex: "#38bdf8", class: "from-sky-500/20 to-sky-600/10 border-sky-500/30 text-sky-600 dark:text-sky-400" },
  { name: "Models / Tasks", hex: "#a78bfa", class: "from-violet-500/20 to-violet-600/10 border-violet-500/30 text-violet-600 dark:text-violet-400" },
  { name: "Settings / Neutral", hex: "#71717a", class: "from-muted-foreground/15 to-muted/30 border-border text-muted-foreground" },
]

const spacing = [
  { token: "page-header", value: "px-6 py-4", use: "ResourcePageHeader shell" },
  { token: "page-body", value: "p-6", use: "List & detail content" },
  { token: "gap-sm", value: "gap-2", use: "Chips, inline controls" },
  { token: "gap-md", value: "gap-4", use: "Metadata grid, form fields" },
  { token: "gap-lg", value: "gap-6", use: "Section stacks" },
]

const surfaces = [
  { name: "App background", class: "bg-background", border: "—" },
  { name: "Card", class: "bg-card/80", border: "border-border" },
  { name: "Inner panel", class: "bg-muted/40", border: "border-border" },
  { name: "Error banner", class: "bg-red-500/10", border: "border-red-500/30" },
]

const semanticTokens = [
  { token: "--background", use: "Page shell, sidebar inset" },
  { token: "--card", use: "Panels, tables, dialogs" },
  { token: "--muted", use: "Subtle fills, hover rows" },
  { token: "--border", use: "Dividers, inputs, charts grid" },
  { token: "--foreground", use: "Primary text" },
  { token: "--muted-foreground", use: "Labels, meta, axis ticks" },
]

export function DesignTokensSlide() {
  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <section className="rounded-xl border border-border bg-card/60 p-8">
        <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Theme</p>
        <h2 className="text-xl font-semibold text-foreground mb-2">Light & dark via CSS variables</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Toggle with the sun/moon control in the top bar. Surfaces use semantic tokens in{" "}
          <code className="text-xs font-mono bg-muted px-1 rounded">app/globals.css</code> — not hardcoded zinc.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {semanticTokens.map((t) => (
            <div key={t.token} className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="font-mono text-xs text-sky-600 dark:text-sky-400">{t.token}</p>
              <p className="text-xs text-muted-foreground mt-1">{t.use}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card/60 p-8">
        <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Slide 1 · Resource accents</p>
        <h2 className="text-xl font-semibold text-foreground mb-6">Semantic color by domain</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {accents.map((a) => (
            <div key={a.name} className={cn("rounded-lg border bg-gradient-to-br p-4", a.class)}>
              <div className="h-8 w-8 rounded-md mb-3 border border-border/60" style={{ backgroundColor: a.hex }} />
              <p className="text-sm font-medium">{a.name}</p>
              <p className="text-[10px] font-mono text-muted-foreground mt-1">{a.hex}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card/60 p-8">
        <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Slide 2 · Status mapping</p>
        <h2 className="text-xl font-semibold text-foreground mb-6">Operational states</h2>
        <div className="flex flex-wrap gap-3 mb-6">
          <StatusBadge status="success" />
          <StatusBadge status="running" />
          <StatusBadge status="failed" />
          <StatusBadge status="pending" />
          <StatusBadge status="cancelled" />
          <StatusBadge status="warning" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs font-mono text-muted-foreground">
          <div className="p-3 rounded border border-border">success → emerald</div>
          <div className="p-3 rounded border border-border">running → sky + spin</div>
          <div className="p-3 rounded border border-border">failed → red</div>
          <div className="p-3 rounded border border-border">pending → amber</div>
          <div className="p-3 rounded border border-border">neutral → muted</div>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card/60 p-8">
        <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Slide 3 · Spacing & surfaces</p>
        <h2 className="text-xl font-semibold text-foreground mb-6">Layout scale</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground text-xs">
                <th className="pb-2">Token</th>
                <th className="pb-2">Tailwind</th>
                <th className="pb-2">Usage</th>
              </tr>
            </thead>
            <tbody className="text-foreground/90">
              {spacing.map((row) => (
                <tr key={row.token} className="border-b border-border/80">
                  <td className="py-2 font-mono text-xs text-sky-600 dark:text-sky-400">{row.token}</td>
                  <td className="py-2 font-mono text-xs">{row.value}</td>
                  <td className="py-2 text-xs text-muted-foreground">{row.use}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="space-y-3">
            {surfaces.map((s) => (
              <div key={s.name} className={cn("rounded-lg border p-4", s.border !== "—" ? s.border : "border-border", s.class)}>
                <p className="text-sm text-foreground">{s.name}</p>
                <p className="text-[10px] font-mono text-muted-foreground mt-1">{s.class}</p>
              </div>
            ))}
          </div>
        </div>
        <p className="text-xs text-muted-foreground/80 mt-6 font-mono">
          Typography: Inter (UI) · JetBrains Mono (run_id, version_id, trace IDs)
        </p>
      </section>
    </div>
  )
}
