# SMART TRAFFIC — System Architecture

> «Simsiz texnologiyalar yordamida yo‘l harakati qoidalarini buzilishini nazorat qilishning avtomatlashtirilgan tizimi»

Companion documents:

| Document | Contents |
|---|---|
| [DATABASE.md](./DATABASE.md) | ERD, table specifications, enums, indexes, partitioning |
| [API.md](./API.md) | REST endpoint specification (`/api/v1`) |
| [WEBSOCKET.md](./WEBSOCKET.md) | Realtime protocol and event catalogue |
| [ROADMAP.md](./ROADMAP.md) | 20-phase implementation plan with definition of done |
| [design/mockups](./design/mockups) | Reference UI mockups (dashboard, monitoring, cameras, violations, vehicles, map) |

---

## 1. Specification analysis

### 1.1 What the system is

An AI traffic control center for Tashkent. Wireless cameras stream video, an isolated
computer-vision service detects vehicles and rule violations, the backend persists
violations with evidence, and operators review them in realtime. Review outcomes feed
analytics and reports. Every privileged action is audited.

### 1.2 Key design decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | **AI compute lives only in `ai-service`.** `backend/app/ai/*` contains the *integration* side (ingestion, plate normalisation, rule configuration, violation creation), not the models. | Spec §3 requires isolation; the backend never imports OpenCV/YOLO, so swapping models never touches the backend. |
| D2 | **AI → backend through an internal ingest API** (`/api/v1/ingest/*`, service-token auth), with an on-disk outbox in the AI service for when the backend is down. | Explicit contract, easy to test, survives backend restarts; no shared DB access from the AI service. |
| D3 | **Demo mode runs the *real* pipeline on a synthetic scene.** A simulator renders an intersection (vehicles, plates, traffic-light cycle); a `MockDetector` returns ground-truth boxes; the **real rule engine** decides violations; the **real ingest API** stores them. | Satisfies spec §45 without fake APIs: everything downstream of the detector is production code. |
| D4 | **Live video = annotated MJPEG from the AI service**, proxied by nginx, authorised by short-lived signed stream tokens. WebRTC/HLS via MediaMTX is a later drop-in. | Browsers cannot play RTSP. Boxes are burned in server-side so overlays are always in sync with the frame. |
| D5 | **Domain events are published after commit** to Redis pub/sub and fanned out by every backend instance's WebSocket gateway. | No phantom events for rolled-back transactions; horizontally scalable WS. |
| D6 | **Async SQLAlchemy 2 + asyncpg** in the API; Celery workers use the same models. | FastAPI + WebSocket benefit from async I/O. |
| D7 | **Integer identity PKs + human-readable public codes** (`CAM-001`, `VL-000124`). | Simple joins and indexes; codes match the mockups and are stable for operators. |
| D8 | **Consistent response envelope**: `{"success": true, "data": …, "meta": …}` / `{"success": false, "error": {…}}`. | Spec §42 defines the error shape; mirroring it for success keeps the client uniform. |
| D9 | **Refresh token in httpOnly cookie, access token in memory**, rotation with reuse detection. | Mitigates XSS token theft; supports session expiry and forced logout. |
| D10 | **High-volume data is rolled up**: `vehicle_detections` and `camera_health_logs` are time-partitioned; analytics read hourly rollup tables. | Spec §49: dashboards must not scan millions of rows. |
| D11 | **No PostGIS initially.** Lat/lng are `numeric(9,6)`; district boundaries are GeoJSON in `jsonb`; camera zones are image-space geometry. | Lower operational complexity; PostGIS can be added later without API changes. |
| D12 | **UI language: Uzbek (Latin) by default via i18n keys**, ready for `ru`/`en`. | Mockups show a language switcher (`Uz`). |

### 1.3 Resolved ambiguities in the spec

| Spec item | Resolution |
|---|---|
| `/cameras` vs `/admin/cameras` | `/cameras` = operational inventory, health, and details. Users with `cameras.create/update` can also add/edit there. `/admin/cameras` = bulk admin table plus test connection, restart, enable/disable, credentials, and zone editor. Both share the same form components. |
| "Tizim loglari" page vs `/admin/logs` | `/logs` = **system logs** (`system_logs.view`). `/admin/logs` = **audit logs** (admin only). |
| `/admin/violations` | Violation **types and rule parameters** (severity, fines, cooldowns, durations), not a second violation list. |
| Comments tab on violation details | Stored as `violation_events` with `event_type = COMMENT`, so the timeline, comments, and audit history share one source. |
| "System uptime" KPI | Platform availability = share of camera-minutes ONLINE over the last 30 days (from health rollups), plus backend process uptime on the admin dashboard. |
| Traffic light state | Pluggable `TrafficLightStateProvider`: `CONTROLLER` (signal controller API), `VISION` (colour classification of a light ROI), `SIMULATED` (demo). |
| Speed measurement | Two virtual lines with a calibrated real-world distance (`SPEED_TRAP` zone). Homography calibration can come later. |
| Uzbek plate formats | Normaliser validates `01 A 123 AA` (individual) and `01 123 AAA` (legal entity), and keeps raw OCR text for audit. |

---

## 2. System architecture

### 2.1 Container view

```mermaid
flowchart LR
    subgraph Field["Field: Tashkent intersections"]
        CAM["IP cameras (RTSP/ONVIF)"]
        TLC["Traffic light controllers"]
    end

    subgraph Edge["Wireless transport"]
        NET["Wi-Fi / 4G LTE / Ethernet"]
    end

    subgraph Platform["SMART TRAFFIC platform (docker-compose)"]
        NGINX["nginx: reverse proxy, TLS, static files"]
        FE["frontend: React SPA"]
        API["backend: FastAPI REST + WebSocket"]
        WRK["celery-worker: reports, rollups, notifications"]
        BEAT["celery-beat: schedules, heartbeat watchdog"]
        AIS["ai-service: stream ingest, YOLO, tracking, OCR, rules"]
        PG[("PostgreSQL 16")]
        RD[("Redis 7: pub/sub, cache, broker, rate limit")]
        OBJ[("Evidence storage: local FS or S3/MinIO")]
    end

    OPS["Operators / Admins (browser)"]

    CAM --> NET --> AIS
    TLC --> NET
    OPS -->|HTTPS| NGINX
    NGINX -->|"/"| FE
    NGINX -->|"/api/v1, /api/v1/ws"| API
    NGINX -->|"/streams (MJPEG)"| AIS
    AIS -->|"ingest REST, service token"| API
    API -->|"control REST"| AIS
    API --> PG
    API --> RD
    API --> OBJ
    WRK --> PG
    WRK --> RD
    WRK --> OBJ
    BEAT --> RD
    AIS -->|"evidence upload via API"| API
```

### 2.2 Responsibilities

| Container | Owns | Never does |
|---|---|---|
| `frontend` | UI, routing, client cache, WS client, permission-aware rendering | Business rules, data aggregation |
| `backend` | Auth, RBAC, domain logic, persistence, aggregation, WS fan-out, audit, file access control | Video decoding, ML inference |
| `ai-service` | Camera connections, frame decoding, detection, tracking, OCR, rule evaluation, evidence capture, MJPEG streaming, heartbeat reporting | Direct DB access, user auth |
| `celery-worker` | Report generation (PDF/XLSX/CSV), hourly rollups, retention cleanup, notification fan-out to many users | Serving HTTP |
| `celery-beat` | Schedules: heartbeat watchdog (every 15 s), rollups (hourly), daily/weekly/monthly reports, retention (daily) | — |
| `nginx` | TLS termination, routing, WS upgrade, gzip, security headers, static SPA, large-body limits | — |

### 2.3 End-to-end flow (spec §54)

```mermaid
sequenceDiagram
    autonumber
    participant C as Camera
    participant A as ai-service
    participant B as backend
    participant DB as PostgreSQL
    participant S as Storage
    participant R as Redis
    participant UI as Operator UI

    C->>A: RTSP over Wi-Fi/4G
    loop every processed frame (5-10 fps)
        A->>A: decode, YOLO detect, ByteTrack, rule engine
    end
    A->>A: rule fires (e.g. RED and crossed stop line)
    A->>A: capture evidence (main, before, after, crops, 6 s clip) and OCR plate
    A->>B: POST /ingest/violations (multipart, service token)
    B->>B: normalise plate, upsert vehicle, assign code VL-xxxxxx
    B->>S: store evidence files
    B->>DB: INSERT violation, evidence, event CREATED, notifications (1 tx)
    B-->>R: after commit: publish violation.created, notification.created
    R-->>B: every API instance receives the event
    B-->>UI: WS violation.created (live alert) + badge update
    UI->>B: PATCH /violations/{id}/confirm
    B->>DB: UPDATE status, INSERT violation_event, INSERT audit_log (1 tx)
    B-->>UI: WS violation.updated
    Note over B,DB: Hourly rollups feed analytics; Celery builds reports from the same data
```

### 2.4 Camera health flow (spec §34)

1. The AI service owns each camera connection. Every `HEARTBEAT_INTERVAL` (5 s) it sends a batch
   to `POST /ingest/heartbeats`: `camera_code, ts, fps, latency_ms, cpu, temperature,
   signal_dbm, packet_loss, status`. In production, hardware metrics come from the camera
   (ONVIF / vendor API) or an edge agent; in demo mode they are simulated with a random walk.
2. The backend updates `cameras.last_heartbeat_at` and the live status cache in Redis, and appends to
   `camera_health_logs` (sampled every 30 s to bound volume; every status change is always stored).
3. `celery-beat` runs `heartbeat_watchdog` every 15 s. Cameras with
   `now - last_heartbeat_at > HEARTBEAT_TIMEOUT_SECONDS` (default 30 s) become `OFFLINE`.
   This writes a `network_logs` DISCONNECTED row and a CRITICAL notification, and publishes
   `camera.status_changed` and `system.alert`.
4. Recovery (heartbeat resumes) produces `RECOVERED`, an INFO notification, and `camera.status_changed`.
5. `WARNING` is derived from thresholds: fps < 50% of target, latency > 500 ms,
   packet loss > 5 %, or signal < -100 dBm (all configurable in `system_settings`).

---

## 3. Backend module architecture

### 3.1 Layering

```
api/routes  ->  services  ->  crud (repositories)  ->  models
     |             |
  schemas      events (after-commit) -> websocket gateway / notifications
```

* **routes**: HTTP only. Parse and validate (Pydantic), call `Depends(require_permission("…"))`, call one
  service method, and wrap the result in the envelope. No SQL.
* **services**: business rules and transaction boundaries (`async with uow:`). Write audit logs,
  queue domain events, and call storage or the AI client.
* **crud**: typed query builders (filtering, whitelisted sorting, pagination, eager loading).
* **models**: SQLAlchemy 2 declarative models with mixins (`TimestampMixin`, `SoftDeleteMixin`).
* **schemas**: Pydantic v2 request/response models. Response models never include secrets.

### 3.2 Package layout (`backend/app`)

```
app/
  main.py                    # app factory, middleware, routers, exception handlers, lifespan
  api/
    deps.py                  # get_db, get_current_user, require_permission, pagination params
    routes/                  # auth, users, roles, permissions, cameras, vehicles, violations,
                             # analytics, reports, notifications, map, dashboard, settings,
                             # system, logs, ai, ingest, files, ws
    router.py                # mounts everything under /api/v1
  core/
    config.py                # pydantic-settings Settings (env vars)
    security.py              # bcrypt hashing, JWT encode/decode, refresh rotation, stream tokens
    permissions.py           # permission codes enum and default role matrix
    errors.py                # AppError hierarchy + error codes + handlers
    middleware.py            # request id, secure headers, access log, timing
    rate_limit.py            # slowapi limiter (Redis storage)
    logging.py               # structlog JSON logging
    crypto.py                # Fernet for camera credentials at rest
  db/
    base.py                  # DeclarativeBase, naming convention, mixins
    session.py               # async engine, sessionmaker, UnitOfWork
  models/                    # one module per aggregate (user.py, camera.py, violation.py, ...)
  schemas/                   # common.py (Envelope, Page, ErrorBody), per-module schemas
  crud/                      # base.py (CRUDBase with filter/sort/paginate), per-module
  services/                  # auth, user, role, camera, camera_health, vehicle, violation,
                             # notification, dashboard, analytics, report, map, settings,
                             # system_health, audit, ai_admin, demo
  ai/                        # integration with ai-service (no CV code)
    client.py                # httpx client: health, test-connection, restart, reload-config
    detection/               # ingest schemas + handler -> vehicle_detections
    tracking/                # track -> vehicle linking, sighting aggregation
    license_plate/           # Uzbek plate normaliser/validator, vehicle upsert
    violations/              # AI violation ingestion -> violation_service; rule/zone config export
  websocket/
    manager.py               # connection registry, per-connection subscriptions, permission filter
    gateway.py               # /ws endpoint: auth handshake, subscribe/unsubscribe, ping
    bridge.py                # Redis pub/sub listener -> manager.broadcast
    events.py                # typed event models + publish_after_commit()
  tasks/
    celery_app.py            # Celery config + beat schedule
    heartbeat.py             # watchdog
    rollups.py               # traffic_stats_hourly, violation_stats_hourly
    reports.py               # PDF (ReportLab), XLSX (openpyxl), CSV
    retention.py             # evidence/log retention per camera settings
    notifications.py         # bulk fan-out
  storage/
    base.py                  # StorageBackend protocol: put/get/delete/signed_url
    local.py                 # STORAGE_PATH, HMAC-signed URLs served by /files
    s3.py                    # boto3 (S3 / MinIO), presigned URLs
  utils/                     # time (Asia/Tashkent), codes (VL-xxxxxx), pagination, files (magic-byte validation)
alembic/                     # env.py (async), versions/
scripts/seed_database.py
tests/                       # unit/, api/, integration/ (pytest)
```

### 3.3 Cross-cutting concerns

| Concern | Implementation |
|---|---|
| AuthN | `Authorization: Bearer <access JWT>` (HS256, `JWT_EXPIRE_MINUTES`, default 15). Claims: `sub, role, perms_ver, tv (token_version), exp, jti`. |
| Refresh | Opaque random token in an httpOnly, `Secure`, `SameSite=Strict` cookie scoped to `/api/v1/auth`. A SHA-256 hash is stored in `user_sessions`. Tokens rotate on every refresh; reusing a revoked token revokes the whole session family. |
| AuthZ | `require_permission("violations.confirm")`. The role → permissions set is cached in Redis and invalidated on role edits. |
| Service auth | `X-Service-Token` (constant-time compare against `AI_SERVICE_TOKEN`) for `/ingest/*` only. |
| Validation | Pydantic v2 strict types, `constr` for plates/codes, bounded page sizes (≤ 100), whitelisted sort fields. |
| Errors | `AppError(code, message, status, details)`, with handlers for `AppError`, `RequestValidationError` (`VALIDATION_ERROR`), `IntegrityError` (`CONFLICT`), and a generic 500 (`INTERNAL_ERROR`, no stack traces leaked). |
| Rate limiting | slowapi + Redis: login 5/min per IP+username; forgot-password 3/hour; global 300/min per user. |
| Brute force | `failed_login_attempts` → lock for 15 min after 10 failures, audited as `LOGIN_FAILED` / `USER_LOCKED`. |
| Headers | CSP, `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`; HSTS at nginx. |
| CORS | `CORS_ORIGINS` allow-list, credentials enabled (cookie refresh). |
| Audit | `audit_service.log(actor, action, entity, entity_id, metadata, ip)` called inside the same transaction as the change. |
| Transactions | One unit of work per request/service call; domain events are queued on the session and published in `after_commit`. |
| Time | Stored as `timestamptz` UTC; displayed in `Asia/Tashkent`. |
| Observability | structlog JSON, request id propagation (`X-Request-ID`), `/system/health` (liveness) and `/system/ready` (DB/Redis/AI checks). |

### 3.4 Evidence storage (spec §37)

* `StorageBackend` protocol with `LocalStorage` (dev) and `S3Storage` (prod / MinIO), selected by `STORAGE_BACKEND`.
* Keys: `evidence/{yyyy}/{mm}/{dd}/{violation_code}/{type}-{uuid}.{ext}`.
* Uploads are validated by magic bytes (`filetype`), MIME allow-list (`image/jpeg`, `image/png`, `image/webp`, `video/mp4`),
  size caps (10 MB image, 50 MB video), and images are re-encoded with Pillow to strip payloads and metadata.
* Clients never see storage paths, only signed, expiring URLs (`/api/v1/files/{key}?exp=…&sig=…` for local, presigned for S3).
* A SHA-256 hash is stored per evidence file for integrity (chain of custody for legal use).

---

## 4. AI service architecture (spec §3, §16–20)

### 4.1 Pipeline

```mermaid
flowchart LR
    SRC["Source: RTSP / video file / synthetic"] --> DEC["Frame decoder + ring buffer (last 10 s)"]
    DEC --> DET["Detector: YOLO / Mock"]
    DET --> TRK["Tracker: ByteTrack"]
    TRK --> OCR["Plate reader: on demand per track"]
    TRK --> RUL["Rule engine"]
    TLS["Traffic light provider"] --> RUL
    ZON["Zones: stop lines, parking, lanes, speed traps"] --> RUL
    RUL -->|ViolationCandidate| EVD["Evidence capture"]
    OCR --> EVD
    EVD --> PUB["Publisher: httpx + disk outbox"]
    TRK -->|"counts, detections (batched 1 s)"| PUB
    DEC --> MJ["Annotated MJPEG stream"]
    PUB --> BE["backend /ingest/*"]
```

### 4.2 Package layout (`ai-service/app`)

```
app/
  main.py                 # FastAPI control API: /health, /streams/{code}.mjpeg, /cameras/{code}/snapshot,
                          # /cameras/{code}/test-connection, /cameras/{code}/restart, /config/reload
  config.py               # AI_MODE=mock|video|rtsp, BACKEND_URL, AI_SERVICE_TOKEN, STREAM_TOKEN_SECRET, ...
  sources/                # base.FrameSource; rtsp.py (OpenCV/FFmpeg, reconnect), video_file.py, synthetic.py
  simulator/              # scene.py (road geometry, lanes), traffic.py (vehicle agents, plates, behaviours
                          # incl. deliberate violators), renderer.py (OpenCV drawing), network.py (signal/latency sim)
  detector/               # base.Detector protocol; yolo.py (ultralytics or ONNX Runtime); mock.py (simulator ground truth)
  tracker/                # base.Tracker; bytetrack.py (supervision.ByteTrack); Track state (history, velocity)
  ocr/                    # base.PlateReader; easyocr_reader.py; mock.py; uz_plate.py (format rules, confusion fixes O/0, I/1)
  traffic_light/          # base.TrafficLightStateProvider; controller.py; vision.py; simulated.py
  rules/
    base.py               # Rule protocol, FrameContext, ViolationCandidate
    geometry.py           # segment crossing, point-in-polygon, vector angle
    red_light.py          # RED + stop-line crossing in the forbidden direction
    stop_line.py          # RED/YELLOW + bbox front edge beyond stop line while stationary
    speeding.py           # SPEED_TRAP: time between line A and B -> km/h; > limit + tolerance
    illegal_parking.py    # in PARKING_RESTRICTED polygon, stationary > allowed_duration, within schedule
    wrong_direction.py    # cosine(track vector, lane vector) < -0.5 for N consecutive frames
    engine.py             # runs enabled rules, per-(track, rule) cooldown and dedup, per-track state
  pipeline/
    camera_worker.py      # one worker per camera: read -> detect (every k-th frame) -> track -> rules
    evidence.py           # main/before/after frames, crops, 6 s MP4 clip (before+after), annotations JSON
    orchestrator.py       # starts/stops workers from backend config, hot reload, health
  publisher/
    backend_client.py     # batched detections, heartbeats, violations (multipart), retry with backoff
    outbox.py             # durable on-disk queue for when the backend is unreachable
  streaming/
    mjpeg.py              # multipart/x-mixed-replace generator; verifies signed stream token
tests/                    # rule engine unit tests with synthetic tracks, geometry, plate normaliser
```

### 4.3 Contracts that make the model swappable

```python
class Detector(Protocol):
    def detect(self, frame: np.ndarray) -> list[Detection]: ...      # bbox xyxy, class, conf

class Tracker(Protocol):
    def update(self, detections: list[Detection], ts: float) -> list[Track]: ...

class PlateReader(Protocol):
    def read(self, vehicle_crop: np.ndarray) -> PlateResult | None: ... # text, conf, plate bbox

class Rule(Protocol):
    code: str                                  # RED_LIGHT, SPEEDING, ...
    def evaluate(self, ctx: FrameContext, tracks: list[Track]) -> list[ViolationCandidate]: ...
```

Swapping the mock for YOLO is a config change: `AI_MODE=rtsp`, `DETECTOR=yolo`, `YOLO_WEIGHTS=…`.

### 4.4 Modes

| `AI_MODE` | Source | Detector | OCR | Traffic light | Use |
|---|---|---|---|---|---|
| `mock` (default demo) | Synthetic renderer | Ground truth from the simulator | Ground truth with injected noise | Simulated cycle | Full demo with no GPU or hardware |
| `video` | MP4 files in `ai-service/samples/` | YOLO (CPU/GPU) | EasyOCR | Simulated or vision | Realistic demo with real CV |
| `rtsp` | Real cameras from backend config | YOLO | EasyOCR / LPR model | Controller or vision | Production |

### 4.5 Rule configuration source

Zones, stop lines, speed traps, lane directions, and per-rule parameters are edited in the UI and stored in
`traffic_zones`, `traffic_lights`, `ai_models`, and `cameras.ai_config`. The AI service pulls them
via `GET /api/v1/ingest/config` on start and on `POST /config/reload`, which the backend triggers
after a change. The AI service never reads the database directly.

---

## 5. Frontend module architecture

### 5.1 Layout (`frontend/src`)

```
src/
  main.tsx, App.tsx
  app/
    providers.tsx            # QueryClient, Theme, i18n, Toaster, WebSocket provider
    router.tsx               # route tree, lazy pages, guards
    query-client.ts
  components/
    ui/                      # shadcn/ui primitives (button, card, dialog, sheet, table, tabs, select, ...)
    common/                  # KpiCard, DataTable, FilterBar, SearchInput, StatusBadge, Pagination,
                             # EmptyState, ErrorState, LoadingSkeleton, ConfirmDialog, Modal, Drawer,
                             # FileUploader, DateRangePicker, Timeline, ChartCard, PageHeader
    camera/                  # CameraCard, LiveCameraCard, CameraStream (signed MJPEG), CameraHealthBadge
    violation/               # ViolationCard, ViolationEvidence (bbox overlay), ViolationStatusBadge, LiveViolationAlert
    map/                     # MapView, CameraMarker, ViolationMarker, HeatmapLayer, DistrictLayer, MapLegend
    notification/            # NotificationItem, NotificationBell
  layouts/
    AppLayout.tsx            # sidebar + topbar + outlet (mockup shell)
    AdminLayout.tsx          # admin sub-navigation
    AuthLayout.tsx
    components/              # Sidebar, Topbar, GlobalSearch (cmdk), SystemStatusWidget, UserMenu, ThemeToggle, LangSwitch, Clock
  features/                  # one folder per domain; each has api.ts, hooks.ts, schemas.ts, types.ts, components/
    auth/ dashboard/ monitoring/ cameras/ violations/ vehicles/ map/ analytics/
    reports/ notifications/ users/ roles/ settings/ system/ logs/ ai/
  pages/                     # thin route components composing feature components
  hooks/                     # usePermission, useDebounce, useWsEvent, useUrlState (filters <-> query string), useInterval
  services/
    http.ts                  # axios instance, envelope unwrap, 401 -> refresh -> retry (single-flight)
    ws.ts                    # WebSocket client: auth handshake, subscriptions, backoff reconnect, heartbeat
    errors.ts                # ApiError mapping code -> i18n message
  store/
    auth.store.ts            # user, permissions, access token (memory only)
    ui.store.ts              # theme, sidebar collapsed, monitoring grid layout (persisted)
    realtime.store.ts        # ws status, live alert queue, unread badge
  types/
    api.gen.ts               # generated from backend OpenAPI (openapi-typescript)
    domain.ts
  utils/                     # format (numbers, dates in Asia/Tashkent), plate formatting, cn()
  i18n/                      # uz.json (default), ru.json, en.json
  styles/globals.css         # Tailwind layers + design tokens (CSS variables, light/dark)
  test/                      # setup, MSW handlers, render helpers
```

### 5.2 Data and state rules

* **Server state is TanStack Query only.** Query keys are scoped per feature (`['violations', filters]`).
  List filters live in the URL (`useUrlState`) so views are shareable and survive reloads.
* **Zustand only for client state**: auth session, UI preferences, and the realtime connection and alert queue.
* **WebSocket events patch the cache** (`queryClient.setQueryData`) for small updates such as KPI counters, camera
  status, and the latest violations list, and **invalidate** for complex lists. After a reconnect, all active
  queries are invalidated to resync.
* **Forms**: React Hook Form + Zod. Zod schemas mirror backend validation; server field errors map back to fields.
* **Permissions**: `<RequirePermission perm="cameras.create">` hides controls, and route guards redirect to `/403`.
  The backend still enforces everything.
* **Performance**: route-level code splitting, virtualised long lists, `loading="lazy"` thumbnails served
  as server-generated small renditions, map marker clustering, and charts rendered only when visible.

### 5.3 Route map

| Route | Page | Permission |
|---|---|---|
| `/login`, `/forgot-password`, `/reset-password` | Auth | public |
| `/dashboard` | Bosh sahifa | `dashboard.view` |
| `/monitoring` | Jonli monitoring | `monitoring.view` |
| `/cameras`, `/cameras/:id` | Kameralar, camera details (tabs: Live, Information, Statistics, Settings, Events, Network) | `cameras.view` |
| `/violations`, `/violations/:id` | Qoidabuzarliklar, details (tabs: Evidence, Timeline, Map, Camera, Comments, Audit) | `violations.view` |
| `/vehicles`, `/vehicles/:id` | Avtomobillar, vehicle details | `vehicles.view` |
| `/map` | Xarita | `monitoring.view` |
| `/analytics` | Tahlil va statistika | `analytics.view` |
| `/reports` | Hisobotlar | `reports.view` |
| `/notifications` | Bildirishnomalar | authenticated |
| `/users` | Foydalanuvchilar | `users.view` |
| `/settings` | Tizim sozlamalari | `settings.view` |
| `/logs` | Tizim loglari | `system_logs.view` |
| `/profile` | Profile + change password | authenticated |
| `/admin` | Admin dashboard (system health) | ADMINISTRATOR |
| `/admin/users`, `/admin/roles`, `/admin/permissions` | Identity and access | `users.*` |
| `/admin/cameras` | Camera administration + zone editor | `cameras.update` |
| `/admin/violations` | Violation types and rule parameters | `settings.update` |
| `/admin/ai` | AI models and detection rule toggles | `settings.update` |
| `/admin/network` | Wireless network overview | `settings.view` |
| `/admin/system` | Services, resources, settings | `settings.update` |
| `/admin/logs` | Audit logs | ADMINISTRATOR |

### 5.4 Design system (derived from the mockups in `design/mockups`)

| Token | Light | Notes |
|---|---|---|
| Background | `#F4F7FB` | page canvas |
| Surface | `#FFFFFF`, radius 16 px, shadow `0 1px 2px rgb(16 24 40 / .04), 0 4px 16px rgb(16 24 40 / .06)` | cards |
| Primary (blue) | `#1D63F2` | active nav, primary buttons, links |
| Success (green) | `#16A34A` | online, confirmed |
| Danger (red) | `#EF4444` | offline, violations, reject |
| Warning (orange) | `#F59E0B` | warning, under review |
| Violet | `#7C3AED` | wrong-direction series, AI accents |
| Text | `#0F172A` / muted `#64748B` | |
| Font | Inter (tabular numerals for KPIs) | |
| Layout | Sidebar 248 px (collapsible to 72 px), topbar 64 px with ⌘K search, clock, theme, bell, language, user | |

Dark mode swaps the same CSS variables (`class="dark"`); there are no hard-coded colours in components.

---

## 6. Repository structure

```
avtocam/                                  # repository root (= smart-traffic)
  backend/
    app/                                  # see §3.2
    alembic/  alembic.ini
    scripts/seed_database.py
    tests/
    pyproject.toml  requirements.txt  requirements-dev.txt
    Dockerfile
  ai-service/
    app/                                  # see §4.2
    models/                               # .pt / .onnx weights (git-ignored, downloaded by script)
    samples/                              # optional demo videos (git-ignored)
    tests/
    requirements.txt  requirements-cv.txt  # cv = heavy deps (ultralytics/torch, easyocr), optional in mock mode
    Dockerfile
  frontend/
    src/                                  # see §5.1
    public/
    index.html  package.json  vite.config.ts  tsconfig.json  components.json  vitest.config.ts
    Dockerfile
  docker/
    nginx/nginx.conf  nginx/default.conf
    postgres/init.sql                     # extensions: pg_trgm, btree_gin
  docs/                                   # architecture docs + mockups
  docker-compose.yml                      # postgres, redis, backend, celery-worker, celery-beat, ai-service, frontend, nginx
  docker-compose.override.yml             # dev: hot reload, exposed ports, vite dev server
  .env.example
  .gitignore  .editorconfig
  README.md
```

---

## 7. Dependencies

### 7.1 Local toolchain (needed on this machine)

| Tool | Version | Status on this machine |
|---|---|---|
| Git | 2.4x | **not installed** |
| Python | 3.12 | **not installed** |
| Node.js | 22 LTS (npm 10) | **not installed** |
| Docker Desktop (WSL2 backend) | latest | **not installed** |
| PostgreSQL / Redis | via Docker | — |

### 7.2 Backend (`backend/requirements.txt`)

`fastapi`, `uvicorn[standard]` (multi-process via `--workers`), `pydantic>=2`, `pydantic-settings`, `email-validator`,
`sqlalchemy[asyncio]>=2.0`, `asyncpg`, `alembic`, `redis>=5`, `celery[redis]>=5.4`,
`pyjwt`, `bcrypt`, `cryptography` (Fernet), `slowapi`, `httpx`, `orjson`, `structlog`,
`python-multipart`, `filetype`, `pillow`, `boto3`, `reportlab`, `openpyxl`, `psutil`.
Dev: `pytest`, `pytest-asyncio`, `pytest-cov`, `asgi-lifespan`, `ruff`, `mypy`.

### 7.3 AI service

Core: `fastapi`, `uvicorn`, `httpx`, `pydantic-settings`, `numpy`, `opencv-python-headless`,
`supervision` (ByteTrack, MIT), `pyjwt`.
Optional CV extra (`requirements-cv.txt`): `ultralytics` **or** `onnxruntime` + ONNX weights, `easyocr`.

> **Licensing note:** Ultralytics YOLOv8/YOLO11 is **AGPL-3.0**. For a closed commercial product you need
> either an Ultralytics enterprise licence or a permissively licensed detector (e.g. YOLOX, Apache-2.0)
> exported to ONNX and run with `onnxruntime`. The `Detector` protocol supports both.

### 7.4 Frontend

`react`, `react-dom`, `typescript`, `vite`, `@vitejs/plugin-react`, `tailwindcss`,
shadcn/ui (`@radix-ui/*`, `class-variance-authority`, `clsx`, `tailwind-merge`, `tailwindcss-animate`),
`react-router-dom`, `@tanstack/react-query`, `@tanstack/react-table`, `@tanstack/react-virtual`,
`zustand`, `react-hook-form`, `zod`, `@hookform/resolvers`, `recharts`, `leaflet`, `react-leaflet`,
`leaflet.heat`, `react-leaflet-cluster`, `lucide-react`, `axios`, `date-fns`, `date-fns-tz`,
`react-day-picker`, `sonner`, `cmdk`, `i18next`, `react-i18next`.
Dev: `vitest`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`,
`jsdom`, `msw`, `openapi-typescript`, `eslint`, `prettier`; optional `@playwright/test` for e2e.

### 7.5 Infrastructure images

`postgres:16-alpine` (with `pg_trgm`), `redis:7-alpine`, `nginx:1.27-alpine`, `python:3.12-slim`,
`node:22-alpine` (build stage), optional `minio/minio` (S3-compatible dev storage, compose profile `s3`).

---

## 8. Environment variables (`.env.example`)

```
# Core
APP_ENV=development
DEMO_MODE=true
TZ_DISPLAY=Asia/Tashkent

# Database / cache
DATABASE_URL=postgresql+asyncpg://smart:smart@postgres:5432/smart_traffic
REDIS_URL=redis://redis:6379/0
CELERY_BROKER_URL=redis://redis:6379/1

# Auth
JWT_SECRET=change-me-64-random-bytes
JWT_EXPIRE_MINUTES=15
JWT_REFRESH_EXPIRE_DAYS=7
CAMERA_SECRET_KEY=fernet-key-for-camera-credentials
STREAM_TOKEN_SECRET=change-me
PASSWORD_RESET_EXPIRE_MINUTES=30

# AI service
AI_SERVICE_URL=http://ai-service:8001
AI_SERVICE_TOKEN=change-me
AI_MODE=mock
HEARTBEAT_INTERVAL_SECONDS=5
HEARTBEAT_TIMEOUT_SECONDS=30

# Storage
STORAGE_BACKEND=local
STORAGE_PATH=/data/storage
S3_ENDPOINT=
S3_BUCKET=smart-traffic-evidence
S3_ACCESS_KEY=
S3_SECRET_KEY=

# HTTP
CORS_ORIGINS=http://localhost:5173,http://localhost
WEBSOCKET_URL=ws://localhost/api/v1/ws

# Mail (forgot password; console backend in dev)
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
MAIL_FROM=no-reply@smart-traffic.uz

# Frontend (Vite)
VITE_API_URL=/api/v1
VITE_WS_URL=/api/v1/ws
VITE_MAP_TILE_URL=https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png
```

---

## 9. Testing strategy

| Layer | Tooling | Focus |
|---|---|---|
| Backend unit | pytest | security helpers, plate normaliser, permission matrix, pagination/sort whitelist |
| Backend API | pytest + httpx AsyncClient + real PostgreSQL test DB (transaction rollback per test) | auth flows, RBAC denials, CRUD, filters, status transitions, audit rows, error envelope |
| Rule engine | pytest in `ai-service` with synthetic track trajectories | red light, stop line, speeding, parking duration and schedule, wrong direction, cooldown/dedup |
| AI integration | pytest: ingest contract tests (service token, multipart evidence, idempotency key) | |
| Frontend | Vitest + Testing Library + MSW | login, guards, dashboard KPIs, cameras, violations review, vehicles, map render, admin forms |
| E2E (optional) | Playwright against docker-compose in demo mode | operator confirms a live violation end to end |

## 10. Known risks

| Risk | Mitigation |
|---|---|
| CPU-only YOLO on many streams is slow | Detect every k-th frame, small models (n/s), ONNX Runtime, GPU node for production, per-camera worker limits |
| OCR accuracy on Uzbek plates | Dedicated plate detector + format-constrained post-processing; operators review every violation before confirmation |
| Legal admissibility of evidence | SHA-256 hashes, immutable evidence rows, full audit trail, synchronized NTP time |
| Volume of detections | Partitioning, batching, rollups, retention jobs |
| Ultralytics AGPL licence | ONNX + Apache-licensed detector path (see §7.3) |
