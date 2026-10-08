# SMART TRAFFIC

**Simsiz texnologiyalar yordamida yo‘l harakati qoidalarini buzilishini nazorat qilishning avtomatlashtirilgan tizimi**

An AI-powered traffic control center. Wireless (Wi-Fi / 4G / Ethernet) cameras stream video to an isolated
computer-vision service that detects vehicles, reads license plates and evaluates traffic rules. Violations are
stored with evidence, pushed to operators in realtime, reviewed, audited, analysed and reported.

| Layer | Stack |
|---|---|
| Frontend | React, TypeScript, Vite, Tailwind CSS, shadcn/ui, TanStack Query, Zustand, Leaflet, Recharts |
| Backend | Python 3.12, FastAPI, SQLAlchemy 2 (async), Alembic, PostgreSQL 16, Redis 7, Celery, WebSocket |
| AI service | OpenCV, YOLO (ONNX Runtime by default, Ultralytics optional), ByteTrack, OCR, rule engine |
| Infrastructure | Docker Compose, nginx |

Design documents live in [`docs/`](docs): [architecture](docs/ARCHITECTURE.md), [database](docs/DATABASE.md),
[REST API](docs/API.md), [WebSocket](docs/WEBSOCKET.md), [roadmap](docs/ROADMAP.md), [UI mockups](docs/design/mockups).

## Status

| Phase | Scope | State |
|---|---|---|
| 1 | Foundation: repository, configuration, Docker, DB/Redis connectivity, error handling, health endpoints | done |
| 2 | Data model (31 tables), Alembic migrations, seed data | done |
| 3 | Authentication (JWT + rotating refresh cookie), RBAC, audit | done |
| 4 | REST API: dashboard, cameras, violations workflow, vehicles, analytics, map, notifications | done |
| 7 | Frontend: dashboard, monitoring, cameras, violations, vehicles, map, analytics, notifications | done (demo data) |
| 5–20 | See [roadmap](docs/ROADMAP.md) | planned |

## Repository layout

```
backend/      FastAPI application (app/), tests, Dockerfile
ai-service/   Computer-vision pipeline service, tests, Dockerfile
frontend/     React application, Dockerfile (static build served by nginx)
docker/       nginx and PostgreSQL configuration
docs/         Architecture, API and database specifications, mockups
```

## Quick start (Docker)

Requirements: Docker Desktop (WSL2 backend on Windows).

```bash
cp .env.example .env          # then replace every "change-me" value
docker compose up --build
```

| URL | What |
|---|---|
| http://localhost | Web application (log in with the seeded admin) |
| http://localhost/api/v1/system/health | Liveness |
| http://localhost/api/v1/system/ready | Readiness (PostgreSQL, Redis, AI service) |
| http://localhost:8000/api/docs | Swagger UI (development; port 8000 is exposed by the override file) |
| http://localhost:8001/health | AI service health (development) |

`docker-compose.override.yml` is applied automatically in development (hot reload, exposed ports).
For a production-like run use `docker compose -f docker-compose.yml up -d --build`.

The one-shot `migrate` service runs `alembic upgrade head` before the backend starts. Load data with:

```bash
docker compose run --rm backend python -m scripts.seed_database          # reference data + admin
docker compose run --rm backend python -m scripts.seed_database --demo   # + demo users and 30 days of history
```

Set `SEED_ADMIN_PASSWORD` (and `SEED_DEMO_PASSWORD`) in `.env` first, or let the seed print a generated
password once (development only).

## Database

```bash
cd backend
alembic upgrade head                      # apply migrations (DATABASE_URL from .env)
alembic downgrade base                    # drop everything created by migrations
alembic revision --autogenerate -m "..."  # new migration after model changes
alembic check                             # fails if models and migrations diverge
python -m scripts.seed_database [--demo] [--seed 42] [--days 30] [--vehicles 2000]
python -m scripts.set_password admin      # prompt for a new password, unlock, sign out all sessions
```

The seed is idempotent: re-running inserts only missing rows and never overwrites admin edits.
Schema details: [docs/DATABASE.md](docs/DATABASE.md).

## macOS setup

```bash
# Prerequisites (Homebrew)
brew install python@3.12 node@22 git
brew install --cask docker            # then start Docker Desktop once

git clone <repository-url> smart-traffic && cd smart-traffic
cp .env.example .env                  # replace every "change-me" value

docker compose up --build             # postgres, redis, backend, ai-service, nginx

# Backend tooling on the host (tests, linters, IDE)
cd backend
python3.12 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/pytest
```

Generate secrets with `python3 -c "import secrets; print(secrets.token_urlsafe(64))"`.

## Local development (without Docker)

PostgreSQL and Redis must be reachable; set `DATABASE_URL` / `REDIS_URL` to `localhost` in `.env`.

```powershell
# Backend
cd backend
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements-dev.txt
.\.venv\Scripts\uvicorn app.main:app --reload --port 8000

# AI service
cd ai-service
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements-dev.txt
.\.venv\Scripts\uvicorn app.main:app --reload --port 8001
```

On Linux/macOS use `.venv/bin/...` instead of `.\.venv\Scripts\...`.

```powershell
# Frontend (Vite proxies /api to http://localhost:8000)
cd frontend
npm install
npm run dev          # http://localhost:5173
npm run build        # type check + production bundle in dist/
```

Optional frontend variables are listed in [`frontend/.env.example`](frontend/.env.example).
The backend must allow the dev origin: `CORS_ORIGINS=http://localhost:5173`.

## Quality checks

```powershell
cd backend
.\.venv\Scripts\ruff check .
.\.venv\Scripts\ruff format --check .
.\.venv\Scripts\mypy app scripts tests
.\.venv\Scripts\pytest
```

The same commands work in `ai-service/`.

Integration tests (migration round trip, schema drift, seed idempotency) run only when
`TEST_DATABASE_URL` points at a disposable database. The Docker PostgreSQL creates one automatically:

```bash
TEST_DATABASE_URL=postgresql+asyncpg://smart:<password>@localhost:5432/smart_traffic_test pytest
```

## API conventions

* Base path `/api/v1`, OpenAPI at `/api/openapi.json`, Swagger at `/api/docs`.
* Success: `{"success": true, "data": ..., "meta": ...}`
* Error: `{"success": false, "error": {"code": "CAMERA_NOT_FOUND", "message": "Camera was not found", "details": null, "request_id": "..."}}`
* Every response carries `X-Request-ID`; the same id appears in structured logs.

## Configuration

All configuration comes from environment variables, documented in [`.env.example`](.env.example).
In `APP_ENV=production` the backend refuses to start with placeholder or short secrets, debug mode,
or a wildcard CORS origin.
