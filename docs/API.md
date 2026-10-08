# SMART TRAFFIC — REST API Specification

Base URL: `/api/v1`. OpenAPI/Swagger is served at `/api/docs` (ReDoc at `/api/redoc`) and is disabled in production unless `ENABLE_DOCS=true`.
Every endpoint declares `summary`, `description`, request/response models, status codes, and its security requirement in OpenAPI.

## 1. Conventions

### 1.1 Envelope

```json
{ "success": true, "data": { }, "meta": { "page": 1, "page_size": 20, "total": 1284, "pages": 65 } }
```

```json
{ "success": false, "error": { "code": "CAMERA_NOT_FOUND", "message": "Camera was not found", "details": null, "request_id": "8f2c…" } }
```

`details` carries field errors for `VALIDATION_ERROR`: `[{"field": "email", "message": "…"}]`.

### 1.2 Lists

`?page=1&page_size=20&search=…&sort=-occurred_at&<filters>`

* `page_size` max 100 (export endpoints stream instead).
* `sort` accepts a per-endpoint whitelist; a `-` prefix means descending. Multiple keys are comma-separated.
* Filters with multiple values repeat the key: `?status=NEW&status=UNDER_REVIEW`.
* Date ranges: `date_from`, `date_to` (ISO 8601, inclusive start, exclusive end).
* High-volume timelines (detections, health logs) use cursor pagination: `?cursor=…&limit=50`, with `meta.next_cursor` in the response.

### 1.3 Security legend

| Tag | Meaning |
|---|---|
| `public` | no auth |
| `auth` | valid access token |
| `perm:<code>` | access token + permission |
| `admin` | role ADMINISTRATOR |
| `service` | `X-Service-Token` (AI service only) |

### 1.4 Standard status codes

`200` OK, `201` Created, `202` Accepted (async job), `204` No Content, `400` business rule violation,
`401` `UNAUTHORIZED` / `TOKEN_EXPIRED`, `403` `FORBIDDEN`, `404` `<ENTITY>_NOT_FOUND`, `409` `CONFLICT` / `INVALID_STATUS_TRANSITION`,
`413` `FILE_TOO_LARGE`, `415` `UNSUPPORTED_MEDIA_TYPE`, `422` `VALIDATION_ERROR`, `429` `RATE_LIMITED`, `500` `INTERNAL_ERROR`, `503` `SERVICE_UNAVAILABLE`.

---

## 2. Endpoints

### 2.1 Auth — `/auth`

| Method | Path | Security | Description |
|---|---|---|---|
| POST | `/auth/login` | public, rate-limited | `{username_or_email, password}` → `{access_token, expires_in, user}` and sets the refresh cookie. Audits `LOGIN_SUCCESS`/`LOGIN_FAILED`. |
| POST | `/auth/refresh` | refresh cookie | Rotates the refresh token and returns a new access token. |
| POST | `/auth/logout` | auth | Revokes the current session and clears the cookie. |
| POST | `/auth/logout-all` | auth | Revokes all sessions and bumps `token_version`. |
| GET | `/auth/me` | auth | Current user, role, permissions. |
| POST | `/auth/forgot-password` | public, rate-limited | Always returns 202 (no user enumeration). Sends a reset link. |
| POST | `/auth/reset-password` | public | `{token, new_password}`; revokes all sessions. |
| POST | `/auth/change-password` | auth | `{current_password, new_password}`. |
| GET | `/auth/sessions` | auth | Active sessions of the current user. |
| DELETE | `/auth/sessions/{id}` | auth | Revoke one session. |

Password policy: at least 10 characters, with upper, lower, and digit; must not equal the username.

### 2.2 Users — `/users`

| Method | Path | Security | Description |
|---|---|---|---|
| GET | `/users` | perm:users.view | Filters: `search, role, status`; sort: `full_name, created_at, last_login`. |
| POST | `/users` | perm:users.create | Create user (`USER_CREATED`). |
| GET | `/users/{id}` | perm:users.view | Details. |
| PATCH | `/users/{id}` | perm:users.update | Update profile, role, or status (`USER_UPDATED`, `ROLE_ASSIGNED`). |
| DELETE | `/users/{id}` | perm:users.delete | Soft delete (`USER_DELETED`); cannot delete self or the last admin. |
| POST | `/users/{id}/block` · `/unblock` · `/deactivate` · `/activate` | perm:users.update | Status changes; blocking revokes sessions. |
| POST | `/users/{id}/reset-password` | perm:users.update | Sets a temporary password or sends a reset link. |
| GET | `/users/{id}/login-history` | perm:users.view | Sessions + login audit events. |
| GET | `/users/{id}/audit-logs` | admin | Actions performed by the user. |
| PATCH | `/users/me` | auth | Update own profile. |
| POST | `/users/me/avatar` | auth | Image upload (validated, re-encoded). |

### 2.3 Roles and permissions — `/roles`, `/permissions`

| Method | Path | Security | Description |
|---|---|---|---|
| GET | `/roles` | perm:users.view | Roles with permission codes and user counts. |
| POST | `/roles` | admin | Create a custom role. |
| GET / PATCH / DELETE | `/roles/{id}` | admin | System roles cannot be deleted. |
| PUT | `/roles/{id}/permissions` | admin | Replace the permission set (`ROLE_PERMISSIONS_CHANGED`). |
| GET | `/permissions` | perm:users.view | All permissions grouped by module. |

### 2.4 Cameras — `/cameras`

| Method | Path | Security | Description |
|---|---|---|---|
| GET | `/cameras` | perm:cameras.view | Filters: `search, status, district_id, location_id, camera_type, connection_type, ai_enabled`; sort: `code, name, status, last_heartbeat_at, violations_today`. Each item includes live metrics (fps, latency, vehicle count, violations today) from the Redis cache. |
| GET | `/cameras/summary` | perm:cameras.view | Counts: total, online, offline, warning, maintenance. |
| POST | `/cameras` | perm:cameras.create | Create (`CAMERA_CREATED`), then triggers an AI config reload. |
| GET | `/cameras/{id}` | perm:cameras.view | Full information (credentials excluded). |
| PATCH | `/cameras/{id}` | perm:cameras.update | Update settings (`CAMERA_UPDATED`, before/after diff). |
| DELETE | `/cameras/{id}` | perm:cameras.delete | Soft delete (`CAMERA_DELETED`). |
| POST | `/cameras/{id}/enable` · `/disable` | perm:cameras.update | `CAMERA_ENABLED` / `CAMERA_DISABLED`. |
| POST | `/cameras/{id}/maintenance` | perm:cameras.update | Toggle MAINTENANCE (suppresses offline alerts). |
| POST | `/cameras/{id}/test-connection` | perm:cameras.update | Proxied to the AI service: reachability, RTSP handshake, resolution, fps, latency. |
| POST | `/cameras/{id}/restart` | perm:cameras.update | Restarts the stream worker (`CAMERA_RESTARTED`). |
| GET | `/cameras/{id}/stream-token` | perm:monitoring.view | Short-lived (60 s) signed URL for MJPEG / snapshot. |
| GET | `/cameras/{id}/statistics` | perm:cameras.view | `?range=24h|7d|30d`: vehicles, violations, fps/latency series, uptime %. |
| GET | `/cameras/{id}/health` | perm:cameras.view | Cursor list of health logs. |
| GET | `/cameras/{id}/network` | perm:cameras.view | Connections + network log cursor list. |
| GET | `/cameras/{id}/events` | perm:cameras.view | Recent detections and violations for the camera. |
| GET / PUT | `/cameras/{id}/zones` | GET perm:cameras.view, PUT perm:cameras.update | Stop lines, parking zones, lanes, speed traps (`ZONES_UPDATED`). |
| GET / PUT | `/cameras/{id}/connections` | GET perm:cameras.view, PUT perm:cameras.update | Wi-Fi / 4G / Ethernet configuration. |
| GET / POST / PATCH / DELETE | `/traffic-lights[/{id}]` | perm:cameras.update (write) | Traffic light definitions. |

### 2.5 Vehicles — `/vehicles`

| Method | Path | Security | Description |
|---|---|---|---|
| GET | `/vehicles` | perm:vehicles.view | Filters: `search` (plate trigram / brand / model / VIN / owner), `vehicle_type, status, has_violations, camera_id, seen_from, seen_to`; sort: `last_seen_at, total_violations, total_detections, plate_number`. |
| GET | `/vehicles/summary` | perm:vehicles.view | Total, active (seen in 24 h), with violations, blacklisted, watchlist; type distribution. |
| GET | `/vehicles/{id}` | perm:vehicles.view | Details + statistics. |
| PATCH | `/vehicles/{id}` | perm:violations.review | Edit brand, model, VIN, owner, notes (`VEHICLE_UPDATED`). |
| POST | `/vehicles/{id}/status` | perm:violations.review | `NORMAL | WATCHLIST | BLACKLIST` with reason (`VEHICLE_BLACKLISTED`, …). |
| GET | `/vehicles/{id}/violations` | perm:violations.view | Paginated. |
| GET | `/vehicles/{id}/detections` | perm:vehicles.view | Cursor list (camera + location history). |
| GET | `/vehicles/{id}/timeline` | perm:vehicles.view | Merged detections and violations. |
| GET | `/vehicles/by-plate/{plate}` | perm:vehicles.view | Exact lookup (normalised). |

### 2.6 Violations — `/violations`

| Method | Path | Security | Description |
|---|---|---|---|
| GET | `/violations` | perm:violations.view | Filters: `date_from, date_to, violation_type, camera_id, location_id, district_id, vehicle_type, plate, status, confidence_min, confidence_max, assigned_to`; sort: `occurred_at, ai_confidence, code, status`. |
| GET | `/violations/summary` | perm:violations.view | Total, confirmed, pending (NEW + UNDER_REVIEW), rejected, today, this week, this month, with deltas against the previous period. |
| GET | `/violations/{id}` | perm:violations.view | Full details incl. signed evidence URLs and annotations. |
| POST | `/violations/{id}/review` | perm:violations.review | NEW → UNDER_REVIEW (assigns to self if unassigned). |
| POST | `/violations/{id}/confirm` | perm:violations.confirm | `{comment?}` → CONFIRMED (`VIOLATION_CONFIRMED`). |
| POST | `/violations/{id}/reject` | perm:violations.reject | `{reason}` required → REJECTED (`VIOLATION_REJECTED`). |
| POST | `/violations/{id}/assign` | perm:violations.review | `{user_id}` (`VIOLATION_ASSIGNED`). |
| POST | `/violations/{id}/archive` | perm:violations.confirm | → ARCHIVED. |
| POST | `/violations/{id}/reopen` | perm:violations.confirm + SUPERVISOR/ADMIN | REJECTED → UNDER_REVIEW. |
| POST | `/violations/bulk` | perm:violations.confirm / reject | `{ids[], action, reason?}`, max 100, all-or-nothing per item with a per-item result list. |
| GET | `/violations/{id}/events` | perm:violations.view | Timeline. |
| POST | `/violations/{id}/comments` | perm:violations.review | Add comment. |
| GET | `/violations/{id}/audit` | perm:violations.view | Audit rows for this entity. |
| GET | `/violations/{id}/evidence/export` | perm:violations.view | ZIP of evidence + `manifest.json` with SHA-256 (`EVIDENCE_EXPORTED`). |
| POST | `/violations/{id}/report` | perm:reports.create | Single-violation PDF protocol (202 + report id). |
| GET | `/violations/export` | perm:violations.view | Streams CSV/XLSX for current filters (max 50k rows; larger exports go through `/reports`). |
| GET | `/violation-types` | auth | Types with severity, colour, active flag. |
| PATCH | `/violation-types/{id}` | perm:settings.update | Severity, fine, rule params, active (`SETTINGS_CHANGED`). |

### 2.7 Dashboard — `/dashboard`

| Method | Path | Security | Description |
|---|---|---|---|
| GET | `/dashboard/kpis` | perm:dashboard.view | Total vehicles, active/offline cameras, today's violations (+% vs yesterday), confirmed, pending, rejected, uptime %. Cached in Redis for 10 s. |
| GET | `/dashboard/system-status` | perm:dashboard.view | Server, DB, Redis, AI service, WebSocket, cameras online/total. |
| GET | `/dashboard/violations-timeseries` | perm:dashboard.view | `?range=24h|7d|30d&group_by=type`. |
| GET | `/dashboard/violation-types` | perm:dashboard.view | Distribution for a range. |
| GET | `/dashboard/vehicle-types` | perm:dashboard.view | Distribution for a range. |
| GET | `/dashboard/recent-violations` | perm:dashboard.view | Last N (default 5). |
| GET | `/dashboard/recent-alerts` | perm:dashboard.view | Last N system/camera alerts. |

### 2.8 Analytics — `/analytics`

All accept `date_from, date_to, district_id, camera_id, violation_type, vehicle_type`.

| Method | Path | Description |
|---|---|---|
| GET | `/analytics/overview` | Headline numbers + period-over-period deltas |
| GET | `/analytics/violations/by-day` | Daily series per type |
| GET | `/analytics/violations/by-hour` | 24-bucket histogram (peak hours) |
| GET | `/analytics/violations/by-weekday-hour` | 7×24 heat grid |
| GET | `/analytics/violations/by-type` | Distribution |
| GET | `/analytics/violations/by-district` | Distribution |
| GET | `/analytics/violations/trend` | Moving average and change vs previous period |
| GET | `/analytics/violations/review-outcomes` | Confirmed vs rejected over time, rejection reasons |
| GET | `/analytics/vehicles/by-type` | Distribution |
| GET | `/analytics/traffic/flow` | Vehicles per hour per camera/district |
| GET | `/analytics/cameras/performance` | Uptime, avg fps, latency, detections and violations per camera |
| GET | `/analytics/ai/accuracy` | Precision proxy = confirmed / (confirmed + rejected) by type, model, camera, and confidence bucket |
| GET | `/analytics/top/cameras` · `/top/locations` · `/top/vehicles` | Top N rankings |

Security: perm:analytics.view.

### 2.9 Map — `/map`

| Method | Path | Security | Description |
|---|---|---|---|
| GET | `/map/cameras` | perm:monitoring.view | Lightweight markers: id, code, lat, lng, status, vehicle count, violations today. |
| GET | `/map/violations` | perm:violations.view | Points within a bbox and date range (max 5,000; clustered client-side). Filters as in violations. |
| GET | `/map/heatmap` | perm:violations.view | Aggregated `[lat, lng, weight]` per location. |
| GET | `/map/vehicles/{id}/track` | perm:vehicles.view | Ordered sightings for a vehicle (route on map). |
| GET | `/map/districts` | auth | District GeoJSON + violation counts. |
| GET | `/map/zones` | perm:monitoring.view | Traffic zones with geographic anchors. |
| GET | `/map/traffic-flow` | perm:monitoring.view | Per-camera flow level (low/medium/high) for the last 15 min. |

### 2.10 Reports — `/reports`

| Method | Path | Security | Description |
|---|---|---|---|
| GET | `/reports` | perm:reports.view | History. Filters: `report_type, format, status, created_by, date range`. |
| POST | `/reports` | perm:reports.create | `{report_type, format, date_from, date_to, filters{district_id, location_id, camera_id, violation_type, vehicle_type}}` → 202 with the report (PENDING). Progress arrives via WS `report.updated`. |
| GET | `/reports/{id}` | perm:reports.view | Status + metadata. |
| GET | `/reports/{id}/download` | perm:reports.view | Signed URL redirect (`REPORT_DOWNLOADED`). |
| DELETE | `/reports/{id}` | perm:reports.create (own) / admin | Delete the file + row. |

### 2.11 Notifications — `/notifications`

| Method | Path | Security | Description |
|---|---|---|---|
| GET | `/notifications` | auth | Own notifications; filters `state, type, category`. |
| GET | `/notifications/unread-count` | auth | Badge count by type. |
| POST | `/notifications/{id}/read` · `/unread` · `/archive` | auth | State changes. |
| POST | `/notifications/read-all` | auth | Mark all read. |
| DELETE | `/notifications/{id}` | auth | Delete own. |
| GET / PUT | `/notifications/preferences` | auth | Per-category toggles (in-app, sound). |

### 2.12 Settings — `/settings`

| Method | Path | Security | Description |
|---|---|---|---|
| GET | `/settings` | perm:settings.view | All settings grouped (general, monitoring, heartbeat thresholds, retention, notifications, map, security). |
| PATCH | `/settings` | perm:settings.update | Partial update (`SETTINGS_CHANGED` with diff). |

### 2.13 AI administration — `/ai`

| Method | Path | Security | Description |
|---|---|---|---|
| GET | `/ai/status` | perm:dashboard.view | AI service health, mode, workers, avg inference ms, queue/outbox depth. |
| GET / POST | `/ai/models` | GET perm:settings.view, POST perm:settings.update | Model registry. |
| GET / PATCH / DELETE | `/ai/models/{id}` | perm:settings.update | Thresholds, rule toggles (`AI_SETTINGS_CHANGED`). |
| POST | `/ai/models/{id}/activate` | perm:settings.update | Make active, then config reload. |
| GET | `/ai/detection-logs` | perm:settings.view | Per-camera inference statistics. |
| POST | `/ai/reload` | perm:settings.update | Push config to the AI service. |

### 2.14 System, logs, files

| Method | Path | Security | Description |
|---|---|---|---|
| GET | `/system/health` | public | Liveness. |
| GET | `/system/ready` | public | Readiness: DB, Redis, AI (degraded vs down). |
| GET | `/system/status` | admin | CPU, RAM, disk, network I/O (psutil), DB pool, Redis memory, WS connections, Celery queues, active users, uptime. |
| GET | `/system/network` | perm:settings.view | Fleet wireless overview: per connection type counts, avg signal, latency, packet loss, degraded cameras. |
| GET | `/logs/system` | perm:system_logs.view | System logs; filters `level, source, search, date range`. |
| GET | `/logs/audit` | admin | Audit logs; filters `user_id, action, entity_type, entity_id, date range`. |
| GET | `/logs/security` | admin | Login failures, lockouts, token reuse, permission denials. |
| GET | `/files/{key}` | signed URL | Local-storage file delivery (`exp` + `sig` query params). |
| GET | `/search` | auth | Global ⌘K search across cameras, plates, violations, users (permission-filtered). |

### 2.15 Ingest (AI service → backend) — `/ingest`

Security: `service`. Not exposed through nginx to the public internet (internal network only).

| Method | Path | Description |
|---|---|---|
| GET | `/ingest/config` | Active cameras (with decrypted RTSP credentials), zones, traffic lights, effective AI config. |
| POST | `/ingest/heartbeats` | Batch of camera heartbeats. |
| POST | `/ingest/detections` | Batch of finished tracks (≤ 500 per call). |
| POST | `/ingest/violations` | `multipart/form-data`: `payload` (JSON: camera_code, rule_code, track_id, plate, confidences, speed, light state, zone_id, occurred_at, idempotency_key, annotations) + evidence files. Returns 201, or 200 with the existing record on an idempotency hit. |
| POST | `/ingest/ai-logs` | Windowed inference statistics + errors. |
| POST | `/ingest/traffic-lights` | Light state changes (when the source is VISION/SIMULATED). |

---

## 3. AI service control API (backend → ai-service, internal)

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Mode, workers, per-camera state |
| POST | `/config/reload` | Re-pull `/ingest/config` and reconcile workers |
| POST | `/cameras/{code}/test-connection` | `{rtsp_url?, timeout}` → reachability, codec, resolution, fps, latency |
| POST | `/cameras/{code}/restart` | Restart worker |
| GET | `/streams/{code}.mjpeg?token=…` | Annotated live stream (public via nginx, signed token) |
| GET | `/cameras/{code}/snapshot.jpg?token=…` | Latest annotated frame |
