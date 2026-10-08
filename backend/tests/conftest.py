import os

os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret-value-that-is-long-enough-for-tests")
os.environ.setdefault("AI_SERVICE_TOKEN", "test-ai-service-token-value-long-enough-for-tests")
os.environ.setdefault("CORS_ORIGINS", "http://localhost:5173")

from collections.abc import AsyncIterator

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.api.deps import get_health_service
from app.main import create_app
from app.schemas.system import (
    ComponentHealth,
    ComponentState,
    ReadinessState,
    ReadinessStatus,
)


class FakeHealthService:
    def __init__(self) -> None:
        self.down: set[str] = set()

    async def readiness(self) -> ReadinessStatus:
        components = [
            ComponentHealth(
                name=name,
                state=ComponentState.DOWN if name in self.down else ComponentState.UP,
                critical=critical,
                latency_ms=None if name in self.down else 1.0,
            )
            for name, critical in (("database", True), ("redis", True), ("ai_service", False))
        ]
        if any(c.critical and c.state is ComponentState.DOWN for c in components):
            status = ReadinessState.NOT_READY
        elif self.down:
            status = ReadinessState.DEGRADED
        else:
            status = ReadinessState.READY
        return ReadinessStatus(status=status, components=components)


@pytest.fixture
def health_service() -> FakeHealthService:
    return FakeHealthService()


@pytest.fixture
def app(health_service: FakeHealthService) -> FastAPI:
    application = create_app()
    application.dependency_overrides[get_health_service] = lambda: health_service
    return application


@pytest.fixture
async def client(app: FastAPI) -> AsyncIterator[AsyncClient]:
    transport = ASGITransport(app=app, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://testserver") as http_client:
        yield http_client
