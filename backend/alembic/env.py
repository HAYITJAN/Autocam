import asyncio
from logging.config import fileConfig
from typing import Any

from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import create_async_engine

import app.models  # noqa: F401  (registers all tables on Base.metadata)
from alembic import context
from app.core.config import get_settings
from app.db.base import Base
from app.db.session import serverless_connect_args

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name, disable_existing_loggers=False)

target_metadata = Base.metadata

# Objects managed only by migrations (not declared on the models).
MIGRATION_ONLY_INDEXES = frozenset({"ix_vehicles_plate_trgm", "ix_violations_plate_trgm"})
PARTITIONED_TABLES = ("camera_health_logs", "vehicle_detections")


def include_object(
    obj: Any, name: str | None, type_: str, reflected: bool, compare_to: Any
) -> bool:
    if type_ == "index" and name in MIGRATION_ONLY_INDEXES:
        return False
    is_partition = (
        type_ == "table"
        and reflected
        and name is not None
        and name.startswith(tuple(f"{parent}_" for parent in PARTITIONED_TABLES))
    )
    return not is_partition


def database_url() -> str:
    return config.get_main_option("sqlalchemy.url") or get_settings().database_url


def run_migrations_offline() -> None:
    context.configure(
        url=database_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        include_object=include_object,
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        include_object=include_object,
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    connect_args = serverless_connect_args() if get_settings().serverless else {}
    engine = create_async_engine(database_url(), poolclass=pool.NullPool, connect_args=connect_args)
    async with engine.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
