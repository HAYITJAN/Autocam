"""End-to-end API checks against a migrated and demo-seeded PostgreSQL database.

Requires TEST_DATABASE_URL (the database is reset to base before and after the module).
"""

import asyncio
import os
import random
from collections.abc import AsyncIterator, Iterator
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pytest
from alembic.config import Config
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from alembic import command
from app.db.session import get_db_session
from app.seed.base import UserSeed, seed_base
from app.seed.demo import seed_demo
from app.seed.reference import ADMIN_ROLE

pytestmark = pytest.mark.integration

TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL", "")
BACKEND_DIR = Path(__file__).resolve().parents[2]

if not TEST_DATABASE_URL:
    pytest.skip("TEST_DATABASE_URL is not set", allow_module_level=True)

PASSWORD = "integration-pass-123"
USERS = [
    UserSeed("admin", "admin@test.local", "Admin", ADMIN_ROLE, PASSWORD),
    UserSeed("operator", "operator@test.local", "Operator", "OPERATOR", PASSWORD),
    UserSeed("viewer", "viewer@test.local", "Viewer", "VIEWER", PASSWORD),
]


def _alembic_config() -> Config:
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    config.set_main_option("sqlalchemy.url", TEST_DATABASE_URL)
    return config


async def _seed() -> None:
    engine = create_async_engine(TEST_DATABASE_URL)
    try:
        async with async_sessionmaker(engine)() as session, session.begin():
            await seed_base(session, users=USERS, allow_generated_passwords=False)
        async with async_sessionmaker(engine)() as session, session.begin():
            await seed_demo(
                session, rng=random.Random(7), now=datetime.now(UTC), days=7, vehicle_count=150
            )
    finally:
        await engine.dispose()


@pytest.fixture(scope="module", autouse=True)
def seeded_database() -> Iterator[None]:
    config = _alembic_config()
    command.downgrade(config, "base")
    command.upgrade(config, "head")
    asyncio.run(_seed())
    yield
    command.downgrade(config, "base")


@pytest.fixture
async def api(app: FastAPI) -> AsyncIterator[AsyncClient]:
    engine = create_async_engine(TEST_DATABASE_URL, poolclass=NullPool)
    sessions = async_sessionmaker(engine, expire_on_commit=False, autoflush=False)

    async def session_override() -> AsyncIterator[AsyncSession]:
        async with sessions() as session:
            yield session

    app.dependency_overrides[get_db_session] = session_override
    transport = ASGITransport(app=app, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        yield client
    await engine.dispose()


async def _login(api: AsyncClient, username: str) -> dict[str, str]:
    response = await api.post(
        "/api/v1/auth/login", json={"username_or_email": username, "password": PASSWORD}
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['data']['access_token']}"}


def _data(response: Any) -> Any:
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["success"] is True
    return body["data"]


class TestAuth:
    async def test_wrong_password_is_rejected_with_envelope(self, api: AsyncClient) -> None:
        response = await api.post(
            "/api/v1/auth/login", json={"username_or_email": "viewer", "password": "nope-nope"}
        )
        assert response.status_code == 401
        assert response.json()["error"]["code"] == "INVALID_CREDENTIALS"

    async def test_login_me_and_refresh_rotation(self, api: AsyncClient) -> None:
        response = await api.post(
            "/api/v1/auth/login",
            json={"username_or_email": "admin@test.local", "password": PASSWORD},
        )
        token = _data(response)["access_token"]
        first_refresh = response.cookies.get("st_refresh")
        assert first_refresh

        me = _data(await api.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"}))
        assert me["role"] == ADMIN_ROLE
        assert "violations.confirm" in me["permissions"]

        rotated = await api.post("/api/v1/auth/refresh")
        assert _data(rotated)["access_token"]
        assert rotated.cookies.get("st_refresh") != first_refresh

        api.cookies.clear()
        api.cookies.set("st_refresh", first_refresh, path="/api/v1/auth")
        reused = await api.post("/api/v1/auth/refresh")
        assert reused.status_code == 401

    async def test_requests_without_token_are_unauthorized(self, api: AsyncClient) -> None:
        response = await api.get("/api/v1/cameras")
        assert response.status_code == 401
        assert response.json()["success"] is False


class TestReadEndpoints:
    async def test_cameras(self, api: AsyncClient) -> None:
        headers = await _login(api, "viewer")
        response = await api.get("/api/v1/cameras", params={"page_size": 10}, headers=headers)
        items = _data(response)
        assert len(items) == 10
        assert response.json()["meta"]["total"] == 45
        summary = _data(await api.get("/api/v1/cameras/summary", headers=headers))
        assert summary["total"] == 45
        detail = _data(await api.get(f"/api/v1/cameras/{items[0]['id']}", headers=headers))
        assert detail["code"] == items[0]["code"]
        stats = await api.get(
            f"/api/v1/cameras/{items[0]['id']}/statistics", params={"range": "7d"}, headers=headers
        )
        assert len(_data(stats)["violations_series"]) == 7

    async def test_violations_and_vehicles(self, api: AsyncClient) -> None:
        headers = await _login(api, "viewer")
        response = await api.get(
            "/api/v1/violations", params={"page_size": 5, "sort": "-occurred_at"}, headers=headers
        )
        items = _data(response)
        assert response.json()["meta"]["total"] > 0
        detail = _data(await api.get(f"/api/v1/violations/{items[0]['id']}", headers=headers))
        assert detail["allowed_actions"] == []
        assert _data(await api.get("/api/v1/violations/summary", headers=headers))["total"] > 0
        vehicles = _data(await api.get("/api/v1/vehicles", headers=headers))
        assert vehicles
        vehicle = _data(await api.get(f"/api/v1/vehicles/{vehicles[0]['id']}", headers=headers))
        assert vehicle["plate_number"] == vehicles[0]["plate_number"]

    @pytest.mark.parametrize(
        "path",
        [
            "/api/v1/dashboard/kpis",
            "/api/v1/dashboard/violations-timeseries?range=24h",
            "/api/v1/dashboard/violations-timeseries?range=30d",
            "/api/v1/dashboard/violation-types",
            "/api/v1/dashboard/vehicle-types",
            "/api/v1/dashboard/recent-violations",
            "/api/v1/dashboard/recent-alerts",
            "/api/v1/analytics/overview",
            "/api/v1/analytics/violations/by-hour",
            "/api/v1/analytics/violations/by-weekday-hour",
            "/api/v1/analytics/violations/by-type",
            "/api/v1/analytics/violations/by-district",
            "/api/v1/analytics/violations/review-outcomes",
            "/api/v1/analytics/cameras/performance",
            "/api/v1/analytics/top/cameras",
            "/api/v1/analytics/top/locations",
            "/api/v1/analytics/top/vehicles",
            "/api/v1/map/cameras",
            "/api/v1/map/heatmap",
            "/api/v1/map/districts",
            "/api/v1/notifications",
            "/api/v1/notifications/unread-count",
            "/api/v1/violation-types",
            "/api/v1/vehicle-types",
            "/api/v1/districts",
        ],
    )
    async def test_aggregations_respond(self, api: AsyncClient, path: str) -> None:
        headers = await _login(api, "viewer")
        assert _data(await api.get(path, headers=headers)) is not None

    async def test_invalid_period_is_422(self, api: AsyncClient) -> None:
        headers = await _login(api, "viewer")
        response = await api.get(
            "/api/v1/analytics/overview",
            params={"date_from": "2026-02-01T00:00:00Z", "date_to": "2026-01-01T00:00:00Z"},
            headers=headers,
        )
        assert response.status_code == 422


class TestViolationWorkflow:
    async def test_viewer_cannot_confirm(self, api: AsyncClient) -> None:
        headers = await _login(api, "viewer")
        items = _data(
            await api.get("/api/v1/violations", params={"status": "NEW"}, headers=headers)
        )
        response = await api.post(f"/api/v1/violations/{items[0]['id']}/confirm", headers=headers)
        assert response.status_code == 403

    async def test_review_confirm_and_invalid_transition(self, api: AsyncClient) -> None:
        headers = await _login(api, "operator")
        items = _data(
            await api.get("/api/v1/violations", params={"status": "NEW"}, headers=headers)
        )
        base = f"/api/v1/violations/{items[0]['id']}"

        reviewed = _data(await api.post(f"{base}/review", headers=headers))
        assert reviewed["status"] == "UNDER_REVIEW"
        assert "confirm" in reviewed["allowed_actions"]

        confirmed = _data(
            await api.post(f"{base}/confirm", json={"comment": "Aniq"}, headers=headers)
        )
        assert confirmed["status"] == "CONFIRMED"
        last_event = confirmed["events"][-1]
        assert (last_event["event_type"], last_event["to_status"]) == (
            "STATUS_CHANGED",
            "CONFIRMED",
        )
        assert last_event["actor"]["username"] == "operator"

        conflict = await api.post(f"{base}/reject", json={"reason": "Xato"}, headers=headers)
        assert conflict.status_code == 409
        assert conflict.json()["error"]["code"] == "INVALID_STATUS_TRANSITION"

    async def test_reject_requires_reason(self, api: AsyncClient) -> None:
        headers = await _login(api, "operator")
        items = _data(
            await api.get("/api/v1/violations", params={"status": "NEW"}, headers=headers)
        )
        response = await api.post(
            f"/api/v1/violations/{items[0]['id']}/reject", json={}, headers=headers
        )
        assert response.status_code == 422


class TestNotifications:
    async def test_read_all(self, api: AsyncClient) -> None:
        headers = await _login(api, "admin")
        _data(await api.post("/api/v1/notifications/read-all", headers=headers))
        unread = _data(await api.get("/api/v1/notifications/unread-count", headers=headers))
        assert unread["total"] == 0

    async def test_unknown_action_is_422(self, api: AsyncClient) -> None:
        headers = await _login(api, "admin")
        response = await api.post("/api/v1/notifications/1/explode", headers=headers)
        assert response.status_code == 422
