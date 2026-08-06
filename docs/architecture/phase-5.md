# Phase 5 — AI Control Plane Features

Phase 5 biến MLAir thành **AI Control Plane** đầy đủ: scheduling thông minh, billing, AI gateway, prompt management, evaluation, marketplace, AutoML, copilot, policy engine và tối ưu tài nguyên.

Migration: `0055_ai_control_plane`

## Epic 1 — Cost-aware Scheduler

| Thành phần | Mô tả |
|------------|--------|
| `cp_scheduling_policies` | Trọng số fairness, cost, deadline, GPU |
| `cp_scheduling_metadata` | Priority score theo run |
| Redis ZSET `mlair:runs:priority` | Thay FIFO khi flag bật |
| `scheduling_service.py` | `publish_run_with_policy`, `pop_next_run_payload` |

**API:** `GET|PUT .../control-plane/scheduling/policy`

Flag: `ML_AIR_COST_AWARE_SCHEDULER=1`

## Epic 2 — Usage Attribution & Chargeback

| Thành phần | Mô tả |
|------------|--------|
| `cp_pricing_rates` | Bảng giá CPU/GPU/RAM/storage/network |
| `cp_chargeback_snapshots` | Báo cáo tháng theo project |
| `billing_service.py` | Ước tính cost từ usage bundle |

**API:**
- `GET .../control-plane/billing/rates`
- `GET .../control-plane/billing/chargeback`
- `GET|POST .../control-plane/billing/snapshots`

Flag: `ML_AIR_CHARGEBACK=1`

## Epic 3 — AI Gateway

Unified LLM proxy: OpenAI, Claude, Gemini, Mistral, Ollama, vLLM, Azure OpenAI.

| Bảng | Mục đích |
|------|----------|
| `cp_ai_providers` | Cấu hình provider |
| `cp_ai_routes` | Routing theo `model_pattern` + fallback |

**API:**
- `GET|POST .../control-plane/gateway/providers`
- `GET|POST .../control-plane/gateway/routes`
- `POST .../control-plane/gateway/chat/completions`

Flag: `ML_AIR_AI_GATEWAY=1`

## Epic 4 — Prompt Management

Luồng: Prompt → Version → Approval → Deployment

**API:** `.../control-plane/prompts/*`

Flag: `ML_AIR_PROMPT_MANAGEMENT=1`

## Epic 5 — LLM Evaluation

Dataset → Prompt → Model → Scores (BLEU, ROUGE, BERTScore, LLM Judge)

**API:** `.../control-plane/evaluations/*`

## Epic 6 — AI Marketplace

Publish models, datasets, pipelines, prompts, plugins.

**API:**
- `GET /v1/control-plane/marketplace/listings`
- `POST .../control-plane/marketplace/listings`

## Epic 7 — AutoML

Search space → training run → evaluation → promotion.

**API:** `.../control-plane/automl/jobs/*`

## Epic 8 — AI Copilot

Hub assistant: explain failure, generate pipeline/prompt, hyperparameter hints.

**API:** `POST .../control-plane/copilot/suggest`

Flag: `ML_AIR_COPILOT=1`

## Epic 9 — Policy Engine

Rules: approval required, readiness, prompt security scan, classification.

**API:**
- `GET|POST .../control-plane/policies/rules`
- `POST .../control-plane/policies/evaluate`

Flag: `ML_AIR_POLICY_ENGINE=1`

## Epic 10 — Resource Optimization

GPU packing, spot instances, autoscaling, prewarming profiles.

**API:** `GET|PUT .../control-plane/optimization/profile`

## Feature flags (runtime-config)

| Flag | Env |
|------|-----|
| `cost_aware_scheduler` | `ML_AIR_COST_AWARE_SCHEDULER` |
| `ai_gateway` | `ML_AIR_AI_GATEWAY` |
| `chargeback` | `ML_AIR_CHARGEBACK` |
| `prompt_management` | `ML_AIR_PROMPT_MANAGEMENT` |
| `policy_engine` | `ML_AIR_POLICY_ENGINE` |
| `copilot` | `ML_AIR_COPILOT` |

## Scheduler integration

`scheduler/main.py` dùng `pop_next_run_payload()` thay `BLPOP` thuần. `queue_service.publish_run_event()` gọi `publish_run_with_policy()`.

## Gateway cache & retry (optional)

| Env | Mô tả |
|-----|--------|
| `ML_AIR_GATEWAY_CACHE=1` | Bật Redis cache cho chat completions |
| `ML_AIR_GATEWAY_CACHE_TTL_SEC=300` | TTL cache (giây) |
| `ML_AIR_GATEWAY_MAX_RETRIES=3` | Retry với exponential backoff (429/5xx) |

Request body `use_cache: false` để bỏ qua cache.

## AutoML search

`automl_search.py` hỗ trợ `grid` và `random` search trên `search_space.parameters`.

**API:**
- `POST .../automl/jobs/{job_id}/search` — sinh trials + enqueue run đầu tiên
- `POST .../automl/jobs/{job_id}/trials/{trial_id}/result` — ghi score, enqueue trial tiếp theo

## Hub UI (optional)

| Route | Trang |
|-------|-------|
| `/ai-gateway` | Providers, routes, chat test |
| `/billing` | Chargeback 30d + snapshots |
| `/prompts` | Prompt CRUD + approve/deploy |
| `/copilot` | Copilot actions |
| `/automl` | AutoML jobs + start search |

Sidebar group **AI Control Plane** hiện khi có ít nhất một feature flag Phase 5 bật (AutoML luôn hiện).
