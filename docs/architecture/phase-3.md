# Phase 3 — Read Platform & Integration

Phase 3 biến **Domain Events** thành read models phục vụ UI và hệ thống bên ngoài — không thêm tính năng AI mới.

## Kiến trúc

```
Domain Events
      │
Outbox Event Bus
      │
┌─────┼─────┬─────────────┐
│     │     │             │
Projection  Metrics   Webhook
│
├── Timeline
├── Activity
├── Dashboard
├── Statistics
└── Analytics
      │
Notification / Integration (HTTP outbound)
```

## Epic 0 — Projection Framework

| Thành phần | Vai trò |
|------------|---------|
| `ProjectionHandler` | Contract ghi read model từ `EventEnvelope` |
| `ProjectionRegistry` | Map event type → handlers |
| `ProjectionRunner` | Fan-out + idempotency (`projection:{name}` ack) |
| `ProjectionCheckpoint` | Lag / health per scope |
| `ProjectionRebuilder` | Replay từ `domain_audit_events` |
| `ProjectionHealth` | `GET .../projections/health` |

Module: `api/app/domains/projections/framework/`

## Epic 1–4 — Projection Stores

| Store | Bảng | Projector |
|-------|------|-----------|
| Timeline | `projected_timeline_events` | `TimelineProjection` |
| Activity | `projected_activity_events` | `ActivityProjection` |
| Dashboard | `projected_dashboard_snapshots` | `DashboardProjection` |
| Statistics | `projected_statistics_daily` | `StatisticsProjection` |
| Analytics | `projected_analytics_rollups` | `AnalyticsProjection` |

Migration: `0053_projection_stores`

## Epic 5 — Notification

- Bảng: `notification_channels`, `notification_delivery_ack`
- Subscriber: `notification_subscriber.py`
- Delivery: webhook HTTP (Slack/Discord/Teams qua incoming webhook URL)
- API: `GET|POST|DELETE .../notifications/channels`

## Epic 6 — Integration Platform

- Bảng: `integration_subscriptions`
- Subscriber: `integration_subscriber.py`
- Delivery: HTTP POST tới ERP/CRM/CI/CD endpoints
- API: `GET|POST|DELETE .../integrations/subscriptions`

## Feature flags

| Env | Mặc định | Ý nghĩa |
|-----|----------|---------|
| `ML_AIR_PROJECTIONS_ENABLED` | `0` | Bật write path (projectors) |
| `ML_AIR_TIMELINE_PROJECTION_READS` | `0` | Timeline API đọc `projected_timeline_events` |
| `ML_AIR_DASHBOARD_PROJECTION_READS` | `0` | Dashboard đọc snapshot projection |
| `ML_AIR_NOTIFICATION_DELIVERY` | `0` | Gửi notification outbound |
| `ML_AIR_INTEGRATION_DELIVERY` | `0` | Gửi integration outbound |

Expose qua `GET /v1/runtime-config` → `features.*`.

## Frontend (Hub)

| Surface | Khi bật flag | API |
|---------|--------------|-----|
| Dashboard KPI runs | `dashboard_projection_reads` | `GET .../projections/dashboard` |
| Dashboard alerts panel | `projections_enabled` | `GET .../projections/activity` |
| Activity page (`/activity`) | luôn có (cần scope pinned) | `GET .../projections/activity` |

## API

| Method | Path | Role |
|--------|------|------|
| GET | `.../projections/activity` | Activity feed |
| GET | `.../projections/dashboard` | Dashboard snapshot |
| GET | `.../projections/analytics` | Analytics rollups |
| GET | `.../projections/health` | Projection lag |
| POST | `.../projections/rebuild` | Maintainer replay |

## Invariants

1. Application services **không** ghi projection tables trực tiếp.
2. Chỉ projection handlers (và rebuilder) ghi read models.
3. Handlers **không** publish business Domain Events.
4. Idempotency: `source_domain_event_id UNIQUE` + handler ack.

## Phase 4+

Governance, Retention, SIEM, Compliance, Security — sau Phase 3.
