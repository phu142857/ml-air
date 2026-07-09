import { StatusBadge } from "@/components/mlops/status-badge"
import { cn } from "@/lib/utils"

const typography = [
  { role: "Body", font: "Inter", token: "font-sans", use: "UI copy, tables, forms" },
  { role: "Headings", font: "Outfit", token: "font-heading", use: "Page titles, card headers, nav brand" },
  { role: "Code", font: "JetBrains Mono", token: "font-mono", use: "IDs, config, timestamps" },
]

const spacing = [
  { token: "1", value: "4px", tailwind: "gap-1 / p-1", use: "Chip padding, tight inline gaps" },
  { token: "2", value: "8px", tailwind: "gap-2 / p-2", use: "Base unit — controls, list gaps" },
  { token: "3", value: "12px", tailwind: "gap-3 / p-3", use: "Icon + label pairs" },
  { token: "4", value: "16px", tailwind: "gap-4 / p-4", use: "Form fields, metadata grids" },
  { token: "5", value: "20px", tailwind: "px-4 py-5", use: "Page header padding" },
  { token: "6", value: "24px", tailwind: "gap-6 / p-6", use: "Section stacks, card padding" },
]

const surfaces = [
  { name: "Panel surface", class: "panel-surface", desc: "Primary container — flat card with border" },
  { name: "Inset surface", class: "inset-surface", desc: "Nested panels, subdued backgrounds" },
  { name: "Page toolbar", class: "page-toolbar", desc: "Filter bars, stats strips" },
]

const semanticTokens = [
  { token: "--background", use: "Page shell, sidebar inset" },
  { token: "--primary", use: "Running · #3F86F3" },
  { token: "--status-success", use: "Success · #7cb518" },
  { token: "--status-warning", use: "Pending / warning · #FCBC04" },
  { token: "--status-dangerous", use: "Failed / destructive · #EB4233" },
  { token: "--card", use: "Panels, tables, dialogs" },
  { token: "--muted", use: "Subtle fills, hover rows" },
  { token: "--border", use: "Dividers, inputs, flat surfaces" },
  { token: "--foreground", use: "Primary text" },
  { token: "--muted-foreground", use: "Labels, meta, axis ticks" },
]

export function DesignTokensSlide() {
  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <section className="panel-surface overflow-hidden p-8">
        <p className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">Theme</p>
        <h2 className="font-heading mb-2 text-xl font-semibold tracking-tight text-foreground">
          Swiss-inspired enterprise flat system
        </h2>
        <p className="mb-6 text-sm text-muted-foreground">
          Inter body + Outfit headings. Flat bordered surfaces — no glass, bezels, or grain.
          Tokens live in{" "}
          <code className="rounded bg-muted px-1 font-mono text-xs">app/globals.css</code>.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {semanticTokens.map((t) => (
            <div key={t.token} className="panel-surface p-3">
              <p className="font-mono text-xs text-primary">{t.token}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t.use}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="panel-surface overflow-hidden p-8">
        <p className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">Typography</p>
        <h2 className="font-heading mb-6 text-xl font-semibold tracking-tight text-foreground">
          Inter · Outfit · JetBrains Mono
        </h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="pb-2">Role</th>
              <th className="pb-2">Font</th>
              <th className="pb-2">Token</th>
              <th className="pb-2">Usage</th>
            </tr>
          </thead>
          <tbody className="text-foreground/90">
            {typography.map((row) => (
              <tr key={row.role} className="border-b border-border">
                <td className="py-2 font-medium">{row.role}</td>
                <td className="py-2">{row.font}</td>
                <td className="py-2 font-mono text-xs text-primary">{row.token}</td>
                <td className="py-2 text-xs text-muted-foreground">{row.use}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="panel-surface overflow-hidden p-8">
        <p className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">
          Status mapping
        </p>
        <h2 className="font-heading mb-6 text-xl font-semibold tracking-tight text-foreground">
          StatusBadge — single status UI
        </h2>
        <div className="mb-6 flex flex-wrap gap-3">
          <StatusBadge value="SUCCESS" />
          <StatusBadge value="RUNNING" />
          <StatusBadge value="FAILED" />
          <StatusBadge value="PENDING" />
          <StatusBadge value="CANCELLED" />
          <StatusBadge value="QUEUED" />
        </div>
        <p className="text-sm text-muted-foreground">
          Pass API strings via the <code className="rounded bg-muted px-1 font-mono text-xs">value</code> prop.
          Mapping uses <code className="rounded bg-muted px-1 font-mono text-xs">statusToMlopsBadge</code> and{" "}
          <code className="rounded bg-muted px-1 font-mono text-xs">normalizeStatus</code> from{" "}
          <code className="rounded bg-muted px-1 font-mono text-xs">lib/status-style</code>.
          Semantic status colors are preserved.
        </p>
      </section>

      <section className="panel-surface overflow-hidden p-8">
        <p className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">
          Spacing & surfaces
        </p>
        <h2 className="font-heading mb-6 text-xl font-semibold tracking-tight text-foreground">
          8px spacing scale
        </h2>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="pb-2">Step</th>
                <th className="pb-2">Px</th>
                <th className="pb-2">Tailwind</th>
                <th className="pb-2">Usage</th>
              </tr>
            </thead>
            <tbody className="text-foreground/90">
              {spacing.map((row) => (
                <tr key={row.token} className="border-b border-border">
                  <td className="py-2 font-mono text-xs text-primary">{row.token}</td>
                  <td className="py-2 font-mono text-xs">{row.value}</td>
                  <td className="py-2 font-mono text-xs">{row.tailwind}</td>
                  <td className="py-2 text-xs text-muted-foreground">{row.use}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="space-y-3">
            {surfaces.map((s) => (
              <div key={s.name} className={cn("p-4", s.class)}>
                <p className="text-sm font-medium text-foreground">{s.name}</p>
                <p className="mt-1 font-mono text-[10px] text-muted-foreground">{s.class}</p>
                <p className="mt-1 text-xs text-muted-foreground">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
