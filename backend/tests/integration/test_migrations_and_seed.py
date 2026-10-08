"""Migration + seed round trip against a real, disposable PostgreSQL database.

Set TEST_DATABASE_URL (e.g. postgresql+asyncpg://smart:...@localhost:5432/smart_traffic_test)
to run. The database is migrated to head, seeded and downgraded back to base.
"""

import asyncio
import os
import random
from collections.abc import Awaitable, Callable, Iterator
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pytest
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from sqlalchemy import Connection, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from alembic import command
from app.db.base import Base
from app.models import Camera, User, Vehicle, Violation, ViolationEvent
from app.seed.base import UserSeed, seed_base
from app.seed.demo import seed_demo
from app.seed.reference import ADMIN_ROLE

pytestmark = pytest.mark.integration

TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL", "")
BACKEND_DIR = Path(__file__).resolve().parents[2]

if not TEST_DATABASE_URL:
    pytest.skip("TEST_DATABASE_URL is not set", allow_module_level=True)


def _alembic_config() -> Config:
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    config.set_main_option("sqlalchemy.url", TEST_DATABASE_URL)
    return config


async def _with_session[T](work: Callable[[AsyncSession], Awaitable[T]]) -> T:
    engine = create_async_engine(TEST_DATABASE_URL)
    try:
        async with async_sessionmaker(engine)() as session, session.begin():
            return await work(session)
    finally:
        await engine.dispose()


def _run[T](work: Callable[[AsyncSession], Awaitable[T]]) -> T:
    return asyncio.run(_with_session(work))


@pytest.fixture(scope="module")
def migrated() -> Iterator[None]:
    config = _alembic_config()
    command.downgrade(config, "base")
    command.upgrade(config, "head")
    yield
    command.downgrade(config, "base")


def _admin() -> UserSeed:
    return UserSeed("admin", "admin@test.local", "Admin", ADMIN_ROLE, "integration-pass-123")


@pytest.mark.usefixtures("migrated")
class TestMigrationAndSeed:
    def test_schema_matches_models(self) -> None:
        def diff(conn: Connection) -> list[Any]:
            context = MigrationContext.configure(
                conn,
                opts={
                    "compare_type": True,
                    "include_object": lambda obj, name, type_, reflected, _: (
                        not (
                            (type_ == "index" and name and name.endswith("_trgm"))
                            or (type_ == "table" and reflected and "_y20" in (name or ""))
                            or (
                                type_ == "table" and reflected and (name or "").endswith("_default")
                            )
                        )
                    ),
                },
            )
            return list(compare_metadata(context, Base.metadata))

        async def work(session: AsyncSession) -> list[Any]:
            connection = await session.connection()
            return await connection.run_sync(diff)

        assert _run(work) == []

    def test_partitions_and_helper_exist(self) -> None:
        async def work(session: AsyncSession) -> list[str]:
            rows = await session.scalars(
                text("SELECT relname FROM pg_class WHERE relispartition AND relkind = 'r'")
            )
            return list(rows)

        partitions = set(_run(work))
        assert {"camera_health_logs_default", "vehicle_detections_default"} <= partitions
        assert sum(name.startswith("vehicle_detections_y") for name in partitions) == 4

    def test_base_seed_is_idempotent(self) -> None:
        async def seed(session: AsyncSession) -> dict[str, int]:
            report = await seed_base(session, users=[_admin()], allow_generated_passwords=False)
            return report.created

        first = _run(seed)
        second = _run(seed)

        assert first["cameras"] == 45
        assert first["permissions"] == 21
        assert first["users"] == 1
        assert not any(second.values())

        async def counts(session: AsyncSession) -> tuple[int | None, int | None]:
            cameras = await session.scalar(select(func.count()).select_from(Camera))
            users = await session.scalar(select(func.count()).select_from(User))
            return cameras, users

        assert _run(counts) == (45, 1)

    def test_seed_requires_password_when_generation_is_disabled(self) -> None:
        async def seed(session: AsyncSession) -> None:
            user = UserSeed("nopass", "nopass@test.local", "No Pass", "VIEWER", None)
            await seed_base(session, users=[user], allow_generated_passwords=False)

        with pytest.raises(ValueError, match="password is required"):
            _run(seed)

    def test_demo_seed_generates_consistent_history(self) -> None:
        now = datetime.now(UTC)

        async def seed(session: AsyncSession) -> tuple[dict[str, int], str | None]:
            report = await seed_demo(
                session, rng=random.Random(7), now=now, days=3, vehicle_count=60
            )
            return report.created, report.skipped_reason

        created, skipped = _run(seed)
        assert skipped is None
        assert created["vehicles"] == 60
        assert created["violations"] > 0

        async def check(session: AsyncSession) -> tuple[Any, ...]:
            orphan_events = await session.scalar(
                select(func.count())
                .select_from(Violation)
                .where(~Violation.id.in_(select(ViolationEvent.violation_id)))
            )
            counter_mismatch = await session.scalar(
                select(func.count())
                .select_from(Vehicle)
                .where(
                    Vehicle.total_violations
                    != select(func.count())
                    .where(Violation.vehicle_id == Vehicle.id)
                    .correlate(Vehicle)
                    .scalar_subquery()
                )
            )
            bad_codes = await session.scalar(
                select(func.count()).where(~Violation.code.regexp_match(r"^VL-\d{6}$"))
            )
            return orphan_events, counter_mismatch, bad_codes

        assert _run(check) == (0, 0, 0)
        _, skipped_again = _run(seed)
        assert skipped_again == "vehicles already exist"
