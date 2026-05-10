# MLAir design stack

This folder holds **reference decks** (tokens, components, do/don’t) for three influences. MLAir does **not** copy any of them wholesale; it **layers** them by surface and job.

| Layer | Reference | Role in MLAir |
|--------|-----------|----------------|
| Primary | [Supabase.md](./Supabase.md) | Default product chrome: dark-first developer SaaS, spacing tuned for dashboards, emerald accent aligned with ML lifecycle and “readiness,” strong fit with shadcn + Tailwind. |
| Secondary | [Linear.md](./Linear.md) | Borrow **patterns**, not the full Linear look: density, tables, command palette, sidebar rhythm, keyboard-first flows, run/task operations. |
| Observability | [Sentry.md](./Sentry.md) | Incident-style surfaces: failures, traces, execution visibility, dense debug layouts—paired with MLAir domains like runs, tasks, retries, lineage, scheduler, and policies. |

---

## 1. Primary foundation → Supabase

Supabase-class surfaces are the best default **foundation** for MLAir because they read as:

- **Dark-first developer SaaS** — technical without stiff enterprise defaulting.
- **Dashboard-friendly spacing** — room for hub layouts, cards, and panels.
- **Card-native** — natural fit for **dataset** and **model** cards.
- **Realtime / devtools-adjacent** — matches streaming state and tooling-heavy workflows.
- **Emerald accent** — reads well for **ML lifecycle** and **readiness / eligibility** (go / caution / blocked) without fighting the UI.
- **shadcn + Tailwind** — straightforward to implement consistently.

**Product alignment (near-native fit):**

- Dataset Hub  
- Readiness & training eligibility  
- Model lifecycle  
- Realtime-driven UI state  
- Query- and cache-driven lists and detail panes  

Detailed tokens and components: [Supabase.md](./Supabase.md).

---

## 2. Secondary inspiration → Linear

**Do not** ship a Linear clone. Use Linear as a **selective** reference for:

- Information **density** and scanability  
- **Table** UX (sorting, columns, row affordances)  
- **Command palette** behavior and discoverability  
- **Sidebar** rhythm and hierarchy  
- **Keyboard-first** flows and shortcuts  
- **Run / task** operations (bulk actions, status-at-a-glance)  

**Where MLAir benefits most:** run lists, task lists, filters, logs, statuses, and observability-adjacent panels that behave like operational tools, not marketing pages.

Patterns and tokens: [Linear.md](./Linear.md).

---

## 3. Sentry-style layer → observability

MLAir already centers **operational** concepts: runs, tasks, retries, failures, lineage, scheduler, policies.

Use **Sentry-style** composition (from [Sentry.md](./Sentry.md)) for:

- Incident / **debugging** screens  
- **Run detail** and deep links into failures  
- **Error** and degraded states  
- **Traces** and timeline-style execution visibility  
- “What happened last?” **execution** narratives  

Keep the **Supabase** foundation for global chrome and primary actions; let **Sentry-style** density and hierarchy own the debugging sub-surfaces so they feel purpose-built, not like generic settings pages.

---

## Practical rule of thumb

1. **Default chrome, marketing-adjacent product, hubs** → Supabase deck.  
2. **Lists, tables, palette, sidebar, keyboard** → Linear patterns on top of Supabase tokens where they conflict, prefer Supabase for color and brand.  
3. **Failures, traces, run/task forensics** → Sentry-style layout and components, still anchored to shared type, spacing, and radius scales from the primary foundation.
