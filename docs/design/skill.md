# MLAir Design Skill

## Identity

MLAir is not a marketing website.

MLAir is an operational ML infrastructure platform focused on:

- orchestration
- lifecycle governance
- readiness management
- lineage visibility
- realtime operational observability

The UI must feel:

- calm
- precise
- trustworthy
- infrastructure-grade
- enterprise-ready

The UI must NOT feel:

- flashy
- playful
- over-animated
- consumer-oriented
- visually noisy

---

# Core Design Philosophy

MLAir follows a Supabase-inspired operational console aesthetic.

The goal is NOT to clone Supabase visually.

The goal is to inherit:

- strong hierarchy
- operational clarity
- low-noise layouts
- density without clutter
- developer-focused UX
- production-grade consistency

MLAir adapts this philosophy for:

- orchestration workflows
- dataset lifecycle management
- model governance
- realtime observability
- ML operations

---

# Design Principles

## 1. Operational First

Every page must optimize for:

- fast scanning
- workflow efficiency
- observability
- operational confidence

Decorative UI is secondary.

---

## 2. Hierarchy Over Decoration

Hierarchy should come from:

- spacing
- typography
- grouping
- contrast

NOT from:

- large shadows
- gradients
- oversized cards
- excessive colors

---

## 3. Calm Enterprise Aesthetic

The interface should feel:

- stable
- reliable
- mature

Use whitespace intentionally.

Avoid visual chaos.

---

## 4. Realtime Without Aggression

Realtime updates must:

- preserve layout stability
- preserve scroll position
- avoid full-page flashing
- use subtle transitions only

---

# Visual Language

## Color System

### Dark Theme

Background:
- #121212

Elevated Surface:
- #242424

Primary Text:
- #fafafa

Secondary Text:
- #898989

Muted Text:
- #4d4d4d

Primary Accent:
- #3ecf8e

Primary Hover:
- #006239

Borders:
- subtle dark neutral borders only

---

## Accent Usage

Green is reserved for:

- primary actions
- successful operations
- active states
- critical CTAs

Never overuse accent colors.

Avoid introducing additional competing accent palettes.

---

# Typography Rules

## Primary Font

Use:

- Circular (or closest equivalent)

Code:
- Source Code Pro
- monospace fallback

---

## Typography Behavior

Prioritize:

- readability
- consistent rhythm
- low visual fatigue

Avoid:

- excessive font weights
- giant hero text
- compressed spacing

---

## Font Weight Rules

Allowed emphasis:

- 400
- 500

Avoid:
- 600+
- ultra-bold headers

---

## Line Height

Minimum:
- 1.5

Operational tables:
- compact but readable

---

# Spacing System

Use strict 4px rhythm.

Allowed spacing scale:

- 4
- 8
- 12
- 16
- 20
- 24
- 32
- 48
- 64

Never use arbitrary spacing.

---

# Radius System

Allowed only:

- 6px
- 8px
- 12px
- 16px

Avoid inconsistent radius mixing.

---

# Elevation Rules

MLAir uses minimal shadow elevation.

Depth should come from:

- layered surfaces
- borders
- contrast

NOT:
- large shadows
- glow effects
- glassmorphism

---

# Layout Rules

## Global Layout

Pages should use:

- centered max-width containers
- generous vertical spacing
- consistent horizontal padding

Recommended:

- max-width: 1600px
- padding-x: 24px

---

## Content Hierarchy

Standard page structure:

1. Page Header
2. Summary Metrics
3. Primary Operational Surface
4. Secondary Information
5. Advanced Controls

---

## Information Density

MLAir is an operational console.

Prefer:

- compact tables
- dense but readable layouts
- fast scanning

Avoid:

- oversized marketing sections
- giant empty whitespace blocks
- unnecessary animations

---

# Component Rules

## Cards

Cards must:

- use subtle borders
- use dark layered surfaces
- avoid heavy shadows
- preserve compact readability

---

## Tables

Tables are first-class operational surfaces.

Requirements:

- compact rows
- sticky headers when large
- hover highlight only
- monospace IDs
- stable spacing

---

## Buttons

### Primary

Use green only for important actions:

- Train
- Promote
- Trigger
- Approve

### Secondary

Use muted outlined buttons.

### Danger

Use subtle red accents only.

Avoid bright destructive colors.

---

## Status Badges

SUCCESS:
- muted green

FAILED:
- muted red

RUNNING:
- subtle animated pulse

PENDING:
- muted neutral

BLOCKED:
- muted amber

---

# Domain UX Ownership

## Dataset Domain

Datasets are the primary lifecycle hub.

Responsibilities:

- readiness
- eligibility
- train trigger
- dataset versions
- lineage entrypoint

Dataset pages should feel:

- workflow-oriented
- operational
- informative

---

## Model Domain

Models are governance surfaces.

Responsibilities:

- versions
- approvals
- serving metadata
- trigger policies
- lifecycle visibility

Model pages should prioritize:

- governance clarity
- version management
- production visibility

---

## Pipeline Domain

Pipelines are orchestration surfaces.

Responsibilities:

- DAG visibility
- execution control
- replay/debugging
- orchestration observability

Pipelines are NOT the primary lifecycle UX.

---

## Run Domain

Runs are operational observability surfaces.

Responsibilities:

- logs
- status
- replay
- realtime updates
- tracking
- task visibility

Runs should feel:

- technical
- stable
- traceable

---

# Realtime UX Rules

Realtime behavior must:

- debounce invalidation
- avoid layout jumps
- preserve user context
- avoid excessive refetch flashing

Use subtle transitions only.

---

# Interaction Philosophy

MLAir interactions should feel:

- intentional
- stable
- predictable

Avoid:

- surprise modals
- hidden actions
- animated overload
- complex hover interactions

---

# Navigation Philosophy

Primary navigation should reflect lifecycle flow:

- Dashboard
- Datasets
- Models
- Runs
- Pipelines
- Lineage
- Tasks
- Settings

Datasets and Models are lifecycle-first.

Pipelines are advanced orchestration tools.

---

# Design Anti-Patterns

Never introduce:

- neon cyberpunk visuals
- excessive gradients
- random accent colors
- oversized dashboards
- marketing-heavy sections
- excessive blur/glassmorphism
- inconsistent spacing systems
- duplicated UI patterns

---

# Frontend Architecture Alignment

The design system must preserve:

- TanStack Query behavior
- realtime websocket architecture
- multi-tenant flows
- orchestration runtime
- existing API contracts

Design refactors should NOT:

- rewrite backend logic
- break compatibility
- duplicate data ownership
- fragment query ownership

---

# Redesign Strategy

Refactor incrementally.

Priority order:

1. Shared UI primitives
2. Dataset Hub
3. Model Governance
4. Runs Observability
5. Pipeline Execution UI

Do not redesign the entire app at once.

---

# Cursor Agent Instructions

When redesigning pages:

- preserve business logic
- preserve API behavior
- preserve realtime behavior
- preserve query ownership

Only refactor:

- hierarchy
- spacing
- typography
- layout
- visual grouping
- component composition

Goal:

Build a calm, enterprise-grade operational ML console inspired by Supabase design philosophy.