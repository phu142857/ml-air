# Kế hoạch triển khai Realtime MLAir UI (Redis Pub/Sub → WebSocket → UI)

Tài liệu này là **lộ trình triển khai có thể thực thi** cho hệ realtime theo kiến trúc: backend phát event → Redis Pub/Sub → dịch vụ WebSocket fan-out → Next.js invalidate TanStack Query. Thiết kế tham chiếu: event envelope chuẩn, kênh theo `tenant_id`/`project_id`, tách lớp, reliability tối thiểu cho production, nâng cấp dần.

---

## 0. Bối cảnh repo (điểm neo)

| Thành phần | Vị trí / ghi chú |
|------------|------------------|
| API FastAPI | `api/app/` (`main.py`, routes `api/app/api/routes/`) |
| Redis sync client | `api/app/services/queue_service.py` — `redis_client()`, biến môi trường `ML_AIR_REDIS_URL` |
| Hàng đợi hiện có | `publish_run_event`, `publish_task_finished` (list RPUSH) — **khác** Pub/Sub; realtime là **kênh mới**, không thay thế queue |
| WebSocket đã có | `api/app/api/routes/v1.py` — ví dụ log run; pattern có thể tái dùng cho auth/đóng kết nối |
| Frontend | `frontend/` — Next.js, `@tanstack/react-query` (`frontend/lib/query-provider.tsx`) |
| Ngữ cảnh tenant/project/token UI | `frontend/lib/app-context.tsx` — dùng cho URL WS và map invalidation |

Mục tiêu: UI cập nhật khi task/run/model/dataset thay đổi **không reload**, cache React Query đồng bộ với server trong giới hạn “best effort” của Pub/Sub.

**Bốn hạng mục bắt buộc trước production (resilience):** (1) `version` trên envelope schema, (2) debounce invalidate toàn cục để tránh thundering herd, (3) WS cleanup (ping/pong, gỡ socket chết, shutdown có kiểm soát), (4) auth WS chặt: JWT + tenant + project thuộc tenant.

> *“Design đã đúng — giờ làm cho nó resilient.”*

---

## 1. Phạm vi phiên bản (v1)

**Trong phạm vi v1**

- Schema event thống nhất và publish lên Redis Pub/Sub theo kênh `mlair.events.{tenant_id}.{project_id}`.
- Một **Realtime service** (process riêng, khuyến nghị) hoặc tích hợp tạm vào API nếu cần ship nhanh — mục tiêu cuối vẫn là process riêng để scale WS độc lập API.
- WebSocket endpoint: client gửi `tenant_id`, `project_id`, và **token** (query hoặc subprotocol tùy chọn); server chỉ fan-out tới socket đã gắn đúng cặp tenant/project.
- Frontend: hook kết nối WS + bảng map `event.type` → `queryClient.invalidateQueries` (và reconnect + debounce).
- Reliability v1: reconnect WS + tùy chọn `refetchInterval` nhẹ trên các query “quan trọng” làm fallback.

**Ngoài phạm vi v1 (ghi rõ là v2/v3)**

- Redis Streams / Kafka, replay event, batching payload lớn.
- Partial merge cache thay vì invalidate toàn query key — có thể làm sớm ở **v1.5** (mục 10).

---

## 2. Hợp đồng event (bắt buộc trước khi code publish)

### 2.1 Envelope JSON (mọi message trên wire)

```json
{
  "version": "v1",
  "event_id": "<uuid>",
  "type": "<string>",
  "tenant_id": "<string>",
  "project_id": "<string>",
  "resource_id": "<string|null>",
  "timestamp": <unix_seconds_float_recommended>,
  "trace_id": "<string|null>",
  "payload": {}
}
```

**Quy ước**

- **`version` (bắt buộc):** phiên bản schema envelope + semantics payload cho từng `type`. UI/backend từ chối hoặc no-op nếu không hỗ trợ (tránh crash khi đổi payload sau này). Thay đổi breaking → bump `v2` và cập nhật consumer song song.
- `type`: namespace dạng `resource.action`, ví dụ `task.updated` — nên map tới **enum** phía server (mục 2.4).
- `timestamp`: thống nhất **Unix float** (`time.time()`) trên toàn hệ; dùng cho log và tie-break phụ nếu cần.
- **`trace_id` (khuyến nghị mạnh):** cùng giá trị với request API / span hiện tại khi emit trong luồng HTTP; log realtime + API dùng chung để correlation khi debug.
- `payload`: tối thiểu cho UI; với event **thay đổi trạng thái** phải có monotonic field (mục 2.5).

### 2.2 Các loại event v1 (tối thiểu)

| `type` | Khi nào emit | Gợi ý `resource_id` |
|--------|----------------|----------------------|
| `run.created` | Sau khi tạo run thành công | `run_id` |
| `run.updated` | Trạng thái/metadata run đổi | `run_id` |
| `task.updated` | Trạng thái task / lease / retry đổi | `task_id` |
| `model.promoted` | Promotion governance (nếu có trong API) | `model_id` hoặc version id |
| `dataset.updated` | Dataset/version đổi | `dataset_id` |

**Payload gợi ý (task/run, mutating):** luôn có `updated_at` (Unix float, đồng bộ DB) và các field UI cần (vd `status`). Ví dụ: `{ "status": "SUCCESS", "updated_at": 1710000000.123 }`.

Mở rộng sau: thêm vào cùng schema, không phá envelope — bump `version` nếu breaking.

### 2.3 Redis channel

- **Chuẩn scale / multi-tenant:** `mlair.events.{tenant_id}.{project_id}`.
- Subscriber WS dùng `PSUBSCRIBE mlair.events.*` (một connection listener), parse `tenant_id`/`project_id` từ body event để route tới đúng nhóm socket (không broadcast toàn cụm).

### 2.4 Chuẩn hóa `type` — `EventType` (Python)

Tránh string rải rác trong codebase:

```python
class EventType(str, Enum):
    RUN_CREATED = "run.created"
    RUN_UPDATED = "run.updated"
    TASK_UPDATED = "task.updated"
    MODEL_PROMOTED = "model.promoted"
    DATASET_UPDATED = "dataset.updated"
```

Publish chỉ dùng `EventType.*.value`. Frontend giữ map `string` → handler (TypeScript `as const` + union nếu muốn tương đương).

### 2.5 Ordering — không đảm bảo thứ tự từ Pub/Sub

Pub/Sub **không** đảm bảo order cross publisher; UI có thể nhận `SUCCESS` trước `RUNNING`. **Fix nhẹ v1:**

- Trong `payload` của mọi event “mutating state” (task/run, …), backend gửi **`updated_at`** (Unix float, **cùng nguồn** với DB `updated_at` hoặc clock commit).
- Frontend: giữ `lastSeenUpdatedAtByResource: Map<resourceKey, number>` (vd key = `task:${taskId}`). Nếu `payload.updated_at < lastSeen` (hoặc đã xử lý `event_id` trùng) → **bỏ qua** cập nhật thứ tự ngược. Với chiến lược chỉ `invalidateQueries`, có thể vẫn invalidate list nhưng khi làm **partial `setQueryData`** thì bắt buộc so `updated_at`.

Kết hợp với **idempotency** (mục 5.6).

---

## 3. Backend — publish

### 3.1 Module và API nội bộ

1. Tạo module mới (đề xuất): `api/app/services/realtime_events.py` (hoặc `event_bus.py`) để **không** trộn lẫn queue list RPUSH trong `queue_service.py`.
2. Hàm công khai nội bộ app:

   - `publish_mlair_event(event: dict) -> None`
   - Bên trong: `channel = f"mlair.events.{event['tenant_id']}.{event['project_id']}"`, `redis_client().publish(channel, json.dumps(event))`.
   - Validate tối thiểu: thiếu key bắt buộc → log + no-op hoặc raise tùy policy (production: log + metric).

3. Helper nhỏ: `build_event(..., trace_id: str | None = None) -> dict` gắn `version="v1"`, `event_id` (uuid4), `timestamp`, và `trace_id` nếu có (lấy từ middleware request / contextvars).

### 3.2 Điểm gọi publish (theo thứ tự ưu tiên triển khai)

| Ưu tiên | Vị trí (service / route) | Event |
|---------|-------------------------|--------|
| P0 | `task_service` / worker callback cập nhật task | `task.updated` |
| P0 | `run_service` (tạo/cập nhật run) | `run.created`, `run.updated` |
| P1 | Model registry / promote webhook | `model.promoted` |
| P1 | Dataset service / routes dataset | `dataset.updated` |

**Nguyên tắc:** emit **sau** khi DB commit thành công (cùng request hoặc sau transaction), tránh UI refetch thấy dữ liệu cũ.

### 3.3 Worker / scheduler / executor

- Nếu worker (Python ngoài `api`) cũng cần đẩy UI: dùng cùng `ML_AIR_REDIS_URL` và cùng schema publish (copy helper nhỏ vào package dùng chung hoặc HTTP nội bộ tới API “internal emit” — ưu tiên **publish trực tiếp Redis** nếu worker đã có Redis).

### 3.4 Cấu hình & an toàn

- Biến môi trường: tái dùng `ML_AIR_REDIS_URL`; có thể thêm `MLAIR_REALTIME_ENABLED=true` để tắt publish trong môi trường không có subscriber.
- Không log full payload có PII; log dạng `[event] type=... resource_id=... tenant=... project=...`.

---

## 4. Realtime service — WebSocket + subscriber

### 4.1 Process riêng (khuyến nghị)

- Thư mục đề xuất: `realtime/` hoặc `services/realtime/` ở root repo.
- Stack: FastAPI + `redis.asyncio` (async pubsub), `uvicorn`.
- Trách nhiệm duy nhất: giữ WS connections, subscribe Redis, đẩy JSON tới client, metrics/log.

**Lý do tách:** scale ngang WS không kéo theo API DB pool; deploy riêng port (ví dụ 8001).

### 4.2 Connection manager — tránh leak socket

- Cấu trúc trong memory: `dict[key, set[WebSocket]]` với `key = f"{tenant_id}:{project_id}"` (hoặc `WeakSet` không phổ biến với WS; ưu tiên set + remove tường minh).
- Trên `accept`: **chỉ** `append`/add sau khi **auth thành công**; không giữ reference nếu handshake fail.
- **Mọi** đường thoát phải `remove`: `WebSocketDisconnect`, exception trong receive loop, send fail, idle timeout, shutdown app.
- **Ping/pong ~30s:** server gửi JSON ping (hoặc WS ping frame nếu stack hỗ trợ); nếu client không phản hồi trong ngưỡng → đóng socket và gỡ khỏi map. Tránh proxy/LB idle disconnect và zombie connection.
- **Send fail:** bất kỳ `send_json` ném lỗi → coi socket chết, remove ngay, không để lại trong list.

### 4.3 Redis listener (một task background)

- `pubsub = client.pubsub(); await pubsub.psubscribe("mlair.events.*")`.
- Với mỗi `pmessage`: parse JSON, derive `key` từ `tenant_id` + `project_id`, `send_json` tới từng socket trong bucket trong `try/except`: lỗi → remove socket.
- **Không** fire-and-forget `create_task` mỗi message mà không giới hạn — xem backpressure (4.7).

### 4.4 Graceful shutdown (bắt buộc)

- Dùng **FastAPI lifespan** (`@asynccontextmanager`): trên startup tạo **một** `asyncio.Task(redis_listener())` và lưu handle; trên shutdown:
  - `task.cancel()` + `await` task (bắt `CancelledError`);
  - `await pubsub.aclose()` / `unsubscribe` theo API `redis.asyncio`;
  - đóng Redis client;
  - đóng tất cả WebSocket còn lại với mã shutdown hợp lệ.
- Tránh để listener chạy mãi sau khi process nhận SIGTERM trong deploy.

### 4.5 Auth WS — enforce chặt (production)

- Query (hoặc tương đương): `/ws?tenant_id=...&project_id=...&token=...`.
- **Bắt buộc tuần tự:**
  1. **Decode + verify JWT** (cùng secret/issuer với API; không tin query tenant/project nếu token có claim đối lập).
  2. **`tenant_id` trong query phải khớp** claim tenant (hoặc scope) trên token.
  3. **`project_id` phải thuộc tenant đó`** — tra DB read-only hoặc gọi nội bộ API có cache; từ chối nếu không tồn tại hoặc cross-tenant.
- Nếu fail bất kỳ bước: đóng WS (vd `4401` / policy), **không** add vào `connections`.
- Log một dòng (không token): `ws_auth_fail reason=tenant_mismatch|project_invalid|jwt_invalid`.

### 4.6 Triển khai & Docker

- Thêm service `realtime` trong `deploy/docker-compose.quickstart.yml` (và Helm nếu có): image build từ `realtime/Dockerfile`, env `ML_AIR_REDIS_URL`, `MLAIR_API_INTERNAL_URL` nếu cần validate token qua HTTP.
- Document URL WS cho dev: `ws://localhost:<REALTIME_PORT>/ws`.

### 4.7 Backpressure (v1 — nhẹ)

- Một project spam event (vd > N message/giây vào cùng bucket WS): nguy cơ **nghẽn** memory và slow consumer.
- **Chiến lược v1 (chọn một hoặc kết hợp):**
  - **Drop:** nếu per-connection outbound queue > `MAX_PENDING` (config) → bỏ event mới hoặc bỏ cũ (ưu tiên giữ **mới nhất** cho cùng `(type, resource_id)` nếu đã coalesce).
  - **Coalesce in-process:** map `resource_id + type` → chỉ giữ payload mới nhất (theo `payload.updated_at` hoặc `timestamp`) trong cửa sổ 100–250 ms rồi flush một lần tới client.
- Metric: `events_dropped_total`, `events_coalesced_total`.

---

## 5. Frontend — hook + TanStack Query

### 5.1 Biến môi trường

- `NEXT_PUBLIC_MLAIR_REALTIME_WS` — base WS URL (vd `ws://localhost:8001`), path `/ws` cố định hoặc gộp trong biến.

### 5.2 Hook `useMlairRealtime` (đề xuất file)

- `frontend/lib/use-mlair-realtime.ts` (hoặc `hooks/`).
- Đọc `tenantId`, `projectId`, `token` từ `useAppContext()`.
- Nếu `tenantId === "all"` hoặc `projectId === "all"`: **không** mở WS (hoặc chỉ subscribe sau khi user chọn project cụ thể — ghi rõ UX).
- `WebSocket` URL build query params; `onopen` / `onerror` / `onclose` với **reconnect exponential backoff** (max delay, jitter nhỏ); `onclose` kích hoạt reconnect có kiểm soát (tránh vòng lặp vô hạn khi 401).
- `onmessage`: parse JSON → validate `version === "v1"` (không hỗ trợ thì log và bỏ qua) → pipeline **idempotency** (5.6) → **ordering** (2.5) → enqueue keys cần invalidate → **debounce** (5.3).

### 5.3 Debounce invalidate — bắt buộc (thundering herd)

50 event trong 1 giây **không** được gọi 50 lần `invalidateQueries`. Dùng **một** scheduler toàn cục (module-level hoặc `useRef` trong hook):

```ts
const pending = new Set<QueryKeyLike>();
let timer: ReturnType<typeof setTimeout> | null = null;

function scheduleInvalidate(
  queryClient: QueryClient,
  key: readonly unknown[],
  delayMs = 300
) {
  pending.add(key);
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    for (const k of pending) {
      queryClient.invalidateQueries({ queryKey: k, exact: false });
    }
    pending.clear();
    timer = null;
  }, delayMs);
}
```

- Gọi `scheduleInvalidate` từ `onmessage` thay vì `invalidateQueries` trực tiếp.
- Có thể gom theo “nhóm” (vd mọi `task.*` chỉ một lần invalidate `["tasks"]` trong cửa sổ 300 ms).

### 5.4 Bảng map event → cache (v1)

| Event | Invalidation (React Query) |
|-------|----------------------------|
| `task.updated` | `["tasks"]`, `["runs"]` (và các key chi tiết nếu dùng `["tasks", taskId]` — dùng `exact: false` khi phù hợp) |
| `run.updated` | `["runs"]` |
| `run.created` | `["runs"]`, có thể `["dashboard"]` nếu có widget runs |
| `model.promoted` | `["models"]` |
| `dataset.updated` | `["datasets"]` |

### 5.5 Gắn vào app

- Trong `frontend/app/layout.tsx` hoặc `frontend/app/providers.tsx` / shell layout đã có `QueryProvider` + `AppContextProvider`: mount provider nhỏ hoặc gọi hook trong layout client bọc children (chỉ một nơi để tránh duplicate socket).

### 5.6 Idempotency & duplicate (frontend nhẹ)

- Redis Pub/Sub có thể khiến client xử lý trùng (reconnect, double delivery hiếm, hoặc logic UI gọi hai lần).
- Giữ `Set<string>` (hoặc **LRU có giới hạn** kích thước để không leak memory): nếu `seen.has(event.event_id)` → return; else `seen.add(event.event_id)`.
- Kết hợp **`updated_at`** (mục 2.5) để bỏ qua stale sau duplicate.

### 5.7 Fallback polling (tùy chọn v1)

- Trên các `useQuery` “critical” (danh sách runs/tasks): `refetchInterval: 5000` khi tab focused hoặc khi `navigator.onLine` — có thể bật chỉ khi `NEXT_PUBLIC_MLAIR_REALTIME_WS` không set.

---

## 6. Observability

- **Log (realtime service):** luôn có `trace_id` khi event mang trace; format gợi ý: `[event] trace_id=... type=... resource=... project=...`, `[ws] key=... sends=n connections=m`.
- **API publish:** log cùng `trace_id` như request HTTP để nối end-to-end.
- **Metrics (sau hoặc cùng PR):** `events_received_total`, `ws_active_connections`, `ws_send_errors_total`, `events_dropped_total` / `events_coalesced_total` (4.7), histogram parse→send.

---

## 7. Kiểm thử & acceptance

**Unit / integration**

- `api/tests/test_realtime_events.py`: envelope + publish channel (chạy `cd api && PYTHONPATH=. python -m unittest discover -s tests -v`; stub `redis` trong test nên không bắt buộc cài deps trên máy dev).
- Publish một event giả → subscriber nhận đúng channel.
- WS: client hợp lệ nhận JSON; client sai token bị từ chối.
- Frontend: mock `WebSocket`, assert sau debounce chỉ **một** wave `invalidateQueries` cho nhiều message; assert duplicate `event_id` không gọi refetch hai lần.

**Manual smoke**

1. Mở UI runs/tasks, trigger cập nhật task từ API/worker.
2. Quan sát network: không full reload; request refetch sau invalidate.
3. Ngắt Redis hoặc restart realtime: client reconnect; sau khi hệ ổn định, event mới vẫn tới.

---

## 8. Rủi ro và giảm thiểu

| Rủi ro | Giảm thiểu |
|--------|-------------|
| Pub/Sub không durable | Reconnect WS + polling nhẹ; roadmap Streams/Kafka |
| Schema payload đổi → UI crash | `version` trên envelope; consumer từ chối version lạ |
| Event trùng / reorder | `event_id` + Set/LRU; `payload.updated_at` so với last seen |
| Số lượng socket lớn | Shard realtime / sticky; giới hạn kết nối/user |
| Thundering herd | Debounce **bắt buộc** (5.3) + `staleTime` hợp lý |
| WS leak / zombie | Ping ~30s; remove on send fail; lifespan shutdown (4.4) |
| Spam event / slow client | Backpressure coalesce/drop (4.7) |
| Auth lỏng | JWT verify + tenant match + project ∈ tenant (4.5) |

---

## 9. Checklist triển khai (copy vào PR/issue)

*Smoke test local đã xác nhận (2026-05-01).*

**Backend**

- [x] Module `publish_mlair_event` + `build_event` + channel `mlair.events.{tenant}.{project}`
- [x] Envelope: `version`, `trace_id`, `EventType` enum; payload mutating có `updated_at`
- [x] `MLAIR_REALTIME_ENABLED` (optional)
- [x] Emit `task.updated` / `run.updated` / `run.created` tại điểm commit DB
- [x] (P1) `model.promoted`, `dataset.updated`

**Realtime service**

- [x] Repo folder + Dockerfile + compose service
- [x] WS `/ws` + connection manager + `psubscribe mlair.events.*`
- [x] Ping/pong ~30s, remove socket khi send fail, không leak trên exception
- [x] Lifespan: cancel listener, đóng pubsub + Redis + WS on shutdown
- [x] Auth: JWT + `tenant_id` match + `project_id` thuộc tenant (4.5)
- [x] Backpressure tối thiểu (4.7) + metric drop/coalesce
- [x] Log có `trace_id`; metrics tối thiểu

**Frontend**

- [x] `NEXT_PUBLIC_MLAIR_REALTIME_WS`
- [x] `useMlairRealtime`: reconnect, **debounce invalidate** (5.3), **idempotency `event_id`** (5.6), so `updated_at` khi cần (2.5), chỉ xử lý `version` đã hỗ trợ
- [x] Mount một lần trong tree providers
- [x] (Optional) `refetchInterval` khi không có WS

**Ops**

- [x] Staging: mở port WS / TLS termination (prod: `wss://`)
- [x] Runbook: “realtime down” = UI vẫn đúng nhờ refetch/poll

---

## 10. Lộ trình nâng cấp (sau v1)

- **v1.5 (optional sớm):** thay một phần `invalidateQueries` bằng `queryClient.setQueryData` cho detail run/task khi payload đủ + guard `updated_at` — giảm flash và tải API.
  - *Đã làm (một phần):* UI merge `status`/`updated_at` vào cache `["run", runId]`, `["runs", tenant, project]`, `["run-tasks", runId]` cho `run.*` / `task.updated`; merge `updated_at` vào `["models", …]` / `["datasets", …]` cho `model.promoted` / `dataset.updated`; sau đó debounce `invalidateQueries`; LRU `event_id`; publish API gắn `get_trace_id()` nhiều luồng; log `realtime_published` INFO khi có `trace_id`; `done_payload.trace_id` khi worker HTTP complete/fail (parity với executor).
- **v2:** batching nhiều event một frame trên wire; heartbeat/metrics chuẩn hóa thêm.
  - *Đã làm (một phần):* realtime service debounce **coalesce** theo `(tenant, project, type, resource_id)` trước fan-out (`MLAIR_REALTIME_COALESCE_MS`, metric `mlair_realtime_events_coalesced_total`).
- **v3:** Redis Streams / Kafka; replay theo offset; ordering + durability mạnh.

---

## 11. Thứ tự commit / PR gợi ý

1. **Contract only:** schema + `publish_mlair_event` (chưa gọi từ business) + test publish/subscribe nhỏ.
2. **Emitters:** gắn vào task/run services + log.
3. **Realtime service:** WS + Redis + auth cơ bản.
4. **Frontend:** hook + env + invalidate map + debounce bắt buộc + idempotency + `version` gate.
5. **Deploy:** compose + docs URL; optional polling fallback.

---

*Tài liệu cố định kiến trúc “realtime là event bus + fan-out”; WebSocket chỉ là transport. Mọi thay đổi envelope (`version`) hoặc semantics payload theo `type` phải đồng bộ mục 2, 4 và 5; ưu tiên resilience: version, debounce, WS lifecycle, auth chặt.*
