from typing import Annotated

from fastapi import Depends
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.redis import get_redis
from app.db.session import get_db_session, get_engine
from app.services.system_health import HealthService

SettingsDep = Annotated[Settings, Depends(get_settings)]
DbSession = Annotated[AsyncSession, Depends(get_db_session)]
RedisDep = Annotated[Redis, Depends(get_redis)]


def get_health_service(settings: SettingsDep) -> HealthService:
    return HealthService(
        engine=get_engine(),
        redis=get_redis(),
        ai_service_url=settings.ai_service_url,
        timeout_seconds=settings.health_check_timeout_seconds,
    )


HealthServiceDep = Annotated[HealthService, Depends(get_health_service)]
