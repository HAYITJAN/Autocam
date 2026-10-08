# SMART TRAFFIC — Implementation Roadmap

Rules for every phase:

* Implement only the phase scope. Verify (lint, type-check, tests, run) before moving on.
* Each phase ends with a report: implemented, files created/modified, DB changes, API endpoints, frontend changes, how to run, how to test, known limitations, next phase.
* No fake APIs: the frontend only consumes real backend endpoints. Demo data is produced by the seed script and the AI simulator through the real ingest API.

| Phase | Scope | Definition of done |
|---|---|---|
| **1. Foundation** | Repository skeleton (backend, ai-service, frontend placeholders, docker, docs), `.env.example`, `.gitignore`, `.editorconfig`, backend app factory, `Settings`, async DB session, Redis client, structured logging, error envelope + handlers, secure-headers middleware, CORS, `/system/health` and `/system/ready`, Dockerfiles, `docker-compose.yml` (postgres, redis, backend, nginx; others stubbed), README | `docker compose up` starts the stack; `/api/v1/system/ready` reports DB and Redis OK; ruff + mypy clean; pytest smoke test green |
| **2. Data model** | All SQLAlchemy models, enums, mixins, naming convention, Alembic async env, initial migration incl. partitions, sequences, trigram indexes, `seed_database.py` (base + `--demo`) | `alembic upgrade head` on an empty DB, `downgrade base` round-trip; seed is idempotent; model tests green |
| **3. Identity** | Password hashing, JWT access, refresh rotation + reuse detection, sessions, forgot/reset/change password (console mail in dev), RBAC dependency, users/roles/permissions APIs, audit service, rate limiting, lockout | Auth and RBAC test suite (≈40 cases) green; Swagger shows security per endpoint |
| **4. Core domain APIs** | Cameras (CRUD, zones, connections, summary, statistics), vehicles, violations (lists, filters, state machine, comments, assign, bulk, export), notifications, violation types, settings, storage abstraction + signed file URLs, ingest API | API tests for each module, including permission denials and invalid transitions |
| **5. Realtime** | Event models, after-commit publisher, Redis bridge, WS gateway (auth handshake, channels, permission filter, backpressure), heartbeat ingest + Celery watchdog, notification fan-out, dashboard KPI coalescing | WS integration tests: auth, subscribe, receive `violation.created` after an ingest call, `camera.status_changed` after a heartbeat timeout |
| **6. AI service (mock)** | ai-service skeleton, sources (synthetic), simulator, mock detector, ByteTrack, mock OCR + Uzbek plate normaliser, traffic light providers, rule engine (red light, stop line, speeding, parking, wrong direction), evidence capture, publisher + outbox, MJPEG streaming, control API | Rule engine unit tests; with compose up, violations appear in the DB from the simulated scene and the stream is viewable via a signed URL |
| **7. Frontend foundation** | Vite + TS strict, Tailwind + shadcn/ui, design tokens (light/dark), i18n (uz), router with lazy routes and guards, AppLayout (sidebar, topbar, ⌘K search, clock, theme, language, bell, user menu), auth pages, http client with refresh, WS client, common components (KpiCard, DataTable, FilterBar, StatusBadge, EmptyState, ErrorState, LoadingSkeleton, ConfirmDialog, Modal, Drawer, Pagination, DateRangePicker, FileUploader, Timeline, ChartCard), generated API types | Login → protected shell works against the real backend; Vitest for login and guards green; `tsc --noEmit` and eslint clean |
| **8. Dashboard** | KPIs, system status, charts (violations, types, vehicle types), camera status, recent violations, live camera previews, Tashkent map preview, recent alerts, realtime updates | Matches mockup 01; updates live when the simulator creates violations |
| **9. Jonli monitoring** | Camera grid (2×2 / 3×2 / 4×3, responsive), LiveCameraCard (MJPEG, FPS, latency, counts, AI status), filters, fullscreen, live violation alert queue, recent events, camera status donut, traffic flow chart | Matches mockup 02; alert → open violation works |
| **10. Kameralar** | Summary, grid/table toggle, mini map, filters, camera drawer, `/cameras/:id` with 6 tabs, create/edit forms, zone editor (draw on snapshot) | Matches mockup 03; CRUD + zones persisted and reloaded by the AI service |
| **11. Qoidabuzarliklar** | Summary cards, filters (URL state), table with bulk actions, side preview, `/violations/:id` with evidence viewer (bbox overlay, before/after, clip), timeline, map, camera, comments, audit; confirm/reject/assign/export | Matches mockup 04; full review flow audited |
| **12. Avtomobillar** | Summary + type donut, tabs (all / with violations / watchlist / blacklist), table, side panel, `/vehicles/:id` with history, timeline, map track, statistics | Matches mockup 05 |
| **13. Xarita** | Leaflet map (Tashkent), camera markers by status, clustered violation markers by severity, heatmap, districts, zones, traffic flow, layer panel, filters, camera popup with live preview, side panel | Matches mockup 06 |
| **14. Tahlil va statistika** | Rollup Celery tasks, analytics endpoints, page with all charts and filters | Numbers reconcile with raw queries in tests |
| **15. Hisobotlar** | Report generator tasks (PDF, XLSX, CSV) for 8 report types, page with form + history + live progress, scheduled daily/weekly/monthly | Generated files open correctly; history persisted |
| **16. Bildirishnomalar** | Inbox with tabs (unread/read/archived), type filters, bulk actions, realtime badge, toasts and optional sound for critical alerts, preferences | Badge updates live; state changes persisted |
| **17. Admin panel** | `/admin` health dashboard (psutil, services, WS, users, errors, security events), users (CRUD, block, reset, login history, audit), roles & permissions matrix editor, camera admin (test connection, restart, credentials), violation types & rule params, AI models & rule toggles, network overview, system settings, audit logs, `/logs` system logs | Admin test suite green; every action audited |
| **18. AI integration** | `video` and `rtsp` modes: YOLO (Ultralytics or ONNX) detector, EasyOCR/LPR reader, vision traffic-light provider, frame skipping, GPU config, model download script | Sample video produces detections and violations through the same ingest path; mock mode still works |
| **19. Testing** | Fill coverage gaps: backend ≥ 80 % on services; frontend tests for login, dashboard, cameras, violations, vehicles, map, admin; optional Playwright e2e | CI-ready test commands documented |
| **20. Deployment** | Production compose profile, multi-stage images, nginx TLS + caching + security headers, healthchecks, resource limits, MinIO/S3 profile, backup script, README ops section | Fresh machine → `docker compose up -d` → working demo in demo mode |

## Phase 1 — detailed plan (implemented)

Files to be **created** (nothing exists yet, so nothing will be overwritten):

```
.gitignore  .editorconfig  .env.example  README.md  docker-compose.yml  docker-compose.override.yml
docker/nginx/nginx.conf  docker/nginx/default.conf  docker/postgres/init.sql
backend/Dockerfile  backend/pyproject.toml  backend/requirements.txt  backend/requirements-dev.txt
backend/app/__init__.py  backend/app/main.py
backend/app/core/{__init__,config,errors,logging,middleware}.py
backend/app/db/{__init__,base,session}.py
backend/app/api/{__init__,deps,router}.py  backend/app/api/routes/{__init__,system}.py
backend/app/schemas/{__init__,common}.py
backend/app/utils/__init__.py  (+ empty packages: models, crud, services, ai/*, websocket, tasks, storage)
backend/tests/{__init__,conftest,test_system}.py
ai-service/Dockerfile  ai-service/requirements.txt  ai-service/app/{__init__,main,config}.py  (health only)
```

`frontend/` is scaffolded with Vite in Phase 7.

Verification: `ruff check`, `mypy`, `pytest` locally (requires Python 3.12) and `docker compose up` (requires Docker Desktop).
