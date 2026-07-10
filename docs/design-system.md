# ML-Air Hub — Enterprise Design System

Swiss-inspired flat SaaS presentation for the MLOps control plane. Presentation-only rules — no business logic changes.

## Typography

| Role | Font | Tailwind token | Usage |
|------|------|----------------|-------|
| Body | Inter | `font-sans` | UI copy, tables, forms, descriptions |
| Headings | Outfit | `font-heading` | Page titles (`h1`), card titles, nav brand |
| Code | JetBrains Mono | `font-mono` | IDs, config values, timestamps |

Fonts are loaded in `frontend/app/layout.tsx` and mapped in `frontend/app/globals.css` via `--font-inter`, `--font-outfit`, and `--font-jetbrains-mono`.

## Color tokens

Semantic CSS variables in `globals.css`:

- `--background` — page shell
- `--card` — panels, tables, dialogs
- `--primary` — running state, links, CTAs (`#3F86F3`)
- `--status-success` — success (`#7cb518`)
- `--status-warning` — pending / warning (`#FCBC04`)
- `--status-dangerous` — failed / destructive (`#EB4233`)
- `--muted`, `--border`, `--foreground`, `--muted-foreground`

Each status tone has derived `-fg`, `-bg`, and `-border` variables for chips and callouts.

## Surfaces

Flat bordered containers — no glass, bezels, grain, or diffused shadows.

| Utility | Description |
|---------|-------------|
| `panel-surface` | Primary container: `rounded-xl border border-border bg-card` |
| `inset-surface` | Nested subdued panel: `rounded-xl border border-border bg-muted` |
| `page-toolbar` | Filter bars and stats strips |
| `dialog-viewport-90` | Large modals: 90vw × 90vh (trace explorer, dataset preview) |

**Removed patterns:** `glass-panel`, `bezel-shell`, `ambient-canvas`, `grain-overlay`, `shadow-diffused`, `shadow-whisper`, `backdrop-blur-*`.

## Spacing (8px scale)

Base unit is **8px** (`gap-2`, `p-2`).

| Step | Px | Tailwind | Typical use |
|------|-----|----------|-------------|
| 1 | 4px | `gap-1` / `p-1` | Chip padding |
| 2 | 8px | `gap-2` / `p-2` | Control gaps, inline spacing |
| 3 | 12px | `gap-3` / `p-3` | Icon + label |
| 4 | 16px | `gap-4` / `p-4` | Form fields, metadata |
| 5 | 20px | `px-4 py-5` | Page header padding |
| 6 | 24px | `gap-6` / `p-6` | Section stacks, card body |

Layout helpers: `page-body` (full-width workspace shell), `page-body-flush` (alias), `scroll-region`. Use `PageScrollBody` with `variant="workspace"` for trace-style full-height table pages.

## Motion

Use `transition-default` for color, background, border, and opacity transitions (150ms ease-out). Respect `prefers-reduced-motion`.

**Removed:** `transition-premium`, `transition-smooth`, `hover:-translate-y-*`, `active:scale-[0.98]`, lift shadows on hover.

## Components

### Buttons (`components/ui/button.tsx`)

- Flat fills, `rounded-lg`, `transition-default`
- No shadow lift or scale on press
- `danger` variant preserved alongside `destructive`

### Cards & panels

- `Card`: flat `rounded-xl border`, `font-heading` on `CardTitle`
- `Panel`: single `panel-surface` layer — no gradient bezel wrapper

### Dialogs

- Overlay: `bg-black/50` (no blur)
- Content: `rounded-xl border` (no `shadow-diffused`)

### Navigation

- Sidebar: flat `border-r`, active item uses `nav-active-rail` (2px left border in `--primary`)
- Topbar: flat `border-b` header (no `glass-panel`)

### StatusBadge (`components/mlops/status-badge.tsx`)

**Single status UI** for operational states. Prefer the `value` prop with raw API strings:

```tsx
<StatusBadge value={run.status} size="sm" />
```

Mapping uses `statusToMlopsBadge` and `normalizeStatus` from `lib/status-style.ts`. Semantic status colors are preserved. Optional `status` prop for explicit variant; optional `label` override.

## Page headers

`ResourcePageHeader` and `PageChrome` use flat `border-b border-border bg-background`. Icon boxes are simple `rounded-lg bg-primary/10` — no nested rings or gradient washes.

## Reference slide

`components/mlops/design-tokens-slide.tsx` documents the live token set for internal review.

## Trace viewer (`/traces`)

Three-pane observability layout inspired by Grafana and Chrome DevTools Performance:

| Pane | Component | Purpose |
|------|-----------|---------|
| Left (resizable) | `trace-list-pane.tsx` | Trace list + `/` search focus |
| Center | `trace-waterfall.tsx` | Sticky timeline ruler, span rows, zoom/pan |
| Right (resizable) | `trace-span-details.tsx` | Metadata, grouped tags, JSON copy |

Orchestrated by `trace-explorer-workspace.tsx`. Keyboard: `↑`/`↓` navigate spans, `Enter` select, `/` focus trace search, `Esc` clear selection, `+`/`-` zoom, `Ctrl+0` reset zoom.

Visual rules: flat `border-border` panels, semantic status colors on bars and `StatusBadge`, 16px parent-child indent per depth level. No gradients or glass effects.

**Dialog mode** (`TraceExplorerDialog`): uses `dialog-viewport-90` (90vw × 90vh). Tab bar adds Events, Logs, Runs, Services, and Execution graph alongside the three-pane Spans workspace.

## Dashboard (`/dashboard`)

Bento grid operations board (Linear / Vercel / Grafana inspired):

| Widget | Source |
|--------|--------|
| KPI strip | `useDashboardStats` — datasets, pipelines, runs, models |
| Active runs | Runs with `RUNNING` status |
| Queue | `PENDING` / `QUEUED` runs |
| Workers | Hostnames from running run environments |
| Storage | Dataset volume + `UsageRollupPanel` |
| Recent traces | `fetchTraceList` |
| Alerts | Failed runs, blocked readiness, audit timeline |
| Pipeline health | Running pipelines + idle ratio |
| GPU usage | Project/tenant usage rollup |

Layout is persisted in `localStorage` (`mlair:dashboard-bento-layout`). **Edit layout** enables drag-to-swap and corner resize; **Widgets** menu toggles visibility and resets layout.
