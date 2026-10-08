import asyncio
from typing import cast

from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncEngine

from app.schemas.system import ComponentState, ReadinessState
from app.services.system_health import HealthService


class StubHealthService(HealthService):
    def __init__(self, failing: set[str] | None = None, slow: set[str] | None = None) -> None:
        super().__init__(
            engine=cast(AsyncEngine, object()),
            redis=cast(Redis, object()),
            ai_service_url="http://ai.invalid",
            timeout_seconds=0.05,
        )
        self.failing = failing or set()
        self.slow = slow or set()

    async def _run(self, name: str) -> None:
        if name in self.slow:
            await asyncio.sleep(1)
        if name in self.failing:
            raise ConnectionError(name)

    async def _check_database(self) -> None:
        await self._run("database")

    async def _check_redis(self) -> None:
        await self._run("redis")

    async def _check_ai_service(self) -> None:
        await self._run("ai_service")


async def test_all_up_is_ready() -> None:
    result = await StubHealthService().readiness()

    assert result.status is ReadinessState.READY
    assert all(c.latency_ms is not None for c in result.components)


async def test_non_critical_failure_is_degraded() -> None:
    result = await StubHealthService(failing={"ai_service"}).readiness()

    assert result.status is ReadinessState.DEGRADED


async def test_critical_failure_is_not_ready() -> None:
    result = await StubHealthService(failing={"redis"}).readiness()

    assert result.status is ReadinessState.NOT_READY
    redis = next(c for c in result.components if c.name == "redis")
    assert redis.state is ComponentState.DOWN
    assert redis.detail == "ConnectionError"


async def test_timeout_marks_component_down() -> None:
    result = await StubHealthService(slow={"database"}).readiness()

    database = next(c for c in result.components if c.name == "database")
    assert database.state is ComponentState.DOWN
    assert database.detail == "TimeoutError"
