import asyncio
import time
from collections.abc import Awaitable, Callable
from typing import cast

import httpx
import structlog
from redis.asyncio import Redis
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from app.schemas.system import ComponentHealth, ComponentState, ReadinessState, ReadinessStatus

logger = structlog.get_logger(__name__)


class HealthService:
    """Probes infrastructure dependencies. PostgreSQL and Redis are critical; the AI service is not,
    because the platform keeps serving stored data while video analysis is down."""

    def __init__(
        self,
        *,
        engine: AsyncEngine,
        redis: Redis,
        ai_service_url: str,
        timeout_seconds: float,
    ) -> None:
        self._engine = engine
        self._redis = redis
        self._ai_service_url = ai_service_url.rstrip("/")
        self._timeout = timeout_seconds

    async def readiness(self) -> ReadinessStatus:
        components = await asyncio.gather(
            self._probe("database", True, self._check_database),
            self._probe("redis", True, self._check_redis),
            self._probe("ai_service", False, self._check_ai_service),
        )
        if any(c.critical and c.state is ComponentState.DOWN for c in components):
            status = ReadinessState.NOT_READY
        elif any(c.state is ComponentState.DOWN for c in components):
            status = ReadinessState.DEGRADED
        else:
            status = ReadinessState.READY
        return ReadinessStatus(status=status, components=list(components))

    async def _probe(
        self, name: str, critical: bool, check: Callable[[], Awaitable[None]]
    ) -> ComponentHealth:
        started = time.perf_counter()
        try:
            await asyncio.wait_for(check(), timeout=self._timeout)
        except Exception as exc:
            logger.warning("health_check_failed", component=name, error=repr(exc))
            return ComponentHealth(
                name=name,
                state=ComponentState.DOWN,
                critical=critical,
                detail=type(exc).__name__,
            )
        return ComponentHealth(
            name=name,
            state=ComponentState.UP,
            critical=critical,
            latency_ms=round((time.perf_counter() - started) * 1000, 2),
        )

    async def _check_database(self) -> None:
        async with self._engine.connect() as connection:
            await connection.execute(text("SELECT 1"))

    async def _check_redis(self) -> None:
        await cast(Awaitable[bool], self._redis.ping())

    async def _check_ai_service(self) -> None:
        async with httpx.AsyncClient(timeout=self._timeout, trust_env=False) as client:
            response = await client.get(f"{self._ai_service_url}/health")
            response.raise_for_status()
