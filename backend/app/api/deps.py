import hmac
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Annotated

import jwt
from fastapi import Depends, Header, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.errors import ErrorCode, ForbiddenError, UnauthorizedError
from app.core.redis import get_redis
from app.core.security import decode_access_token
from app.db.session import get_db_session, get_engine
from app.models.enums import UserStatus
from app.services.audit import ClientInfo
from app.services.auth import load_user_with_permissions
from app.services.media import MediaSigner
from app.services.system_health import HealthService

SettingsDep = Annotated[Settings, Depends(get_settings)]
DbSession = Annotated[AsyncSession, Depends(get_db_session)]
RedisDep = Annotated[Redis, Depends(get_redis)]


def get_media_signer(settings: SettingsDep) -> MediaSigner:
    return MediaSigner.from_settings(settings)


MediaSignerDep = Annotated[MediaSigner, Depends(get_media_signer)]


async def require_service_token(
    settings: SettingsDep,
    token: Annotated[str | None, Header(alias="X-Service-Token")] = None,
) -> None:
    """Machine-to-machine auth for the AI service (shared `AI_SERVICE_TOKEN`)."""
    expected = settings.ai_service_token.get_secret_value().encode()
    if not token or not hmac.compare_digest(token.encode(), expected):
        raise UnauthorizedError("Service token is missing or invalid")


ServiceAuth = Depends(require_service_token)

bearer_scheme = HTTPBearer(auto_error=False, description="JWT access token from /auth/login")


def get_health_service(settings: SettingsDep) -> HealthService:
    return HealthService(
        engine=get_engine(),
        redis=get_redis(),
        ai_service_url=settings.ai_service_url,
        timeout_seconds=settings.health_check_timeout_seconds,
    )


HealthServiceDep = Annotated[HealthService, Depends(get_health_service)]


def get_client_info(request: Request) -> ClientInfo:
    return ClientInfo.from_request(request)


ClientDep = Annotated[ClientInfo, Depends(get_client_info)]


@dataclass(frozen=True, slots=True)
class CurrentUser:
    id: int
    username: str
    full_name: str
    email: str
    role_code: str
    role_name: str
    permissions: frozenset[str]
    session_id: str | None

    def has(self, permission: str) -> bool:
        return permission in self.permissions


async def get_current_user(
    session: DbSession,
    settings: SettingsDep,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> CurrentUser:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise UnauthorizedError(headers={"WWW-Authenticate": "Bearer"})
    try:
        claims = decode_access_token(
            credentials.credentials,
            secret=settings.jwt_secret.get_secret_value(),
            algorithm=settings.jwt_algorithm,
        )
    except jwt.ExpiredSignatureError as exc:
        raise UnauthorizedError("Access token has expired", code=ErrorCode.TOKEN_EXPIRED) from exc
    except jwt.InvalidTokenError as exc:
        raise UnauthorizedError("Access token is invalid", code=ErrorCode.TOKEN_INVALID) from exc

    user = await load_user_with_permissions(session, claims.user_id)
    if (
        user is None
        or user.status is not UserStatus.ACTIVE
        or user.token_version != claims.token_version
    ):
        raise UnauthorizedError("Access token is no longer valid", code=ErrorCode.TOKEN_INVALID)
    return CurrentUser(
        id=user.id,
        username=user.username,
        full_name=user.full_name,
        email=user.email,
        role_code=user.role.code,
        role_name=user.role.name,
        permissions=frozenset(p.code for p in user.role.permissions),
        session_id=claims.session_id,
    )


CurrentUserDep = Annotated[CurrentUser, Depends(get_current_user)]


def require_permissions(*codes: str) -> Callable[[CurrentUser], Awaitable[CurrentUser]]:
    """Dependency factory: the user must hold every listed permission."""

    async def dependency(user: CurrentUserDep) -> CurrentUser:
        missing = [code for code in codes if not user.has(code)]
        if missing:
            raise ForbiddenError(details={"missing_permissions": missing})
        return user

    return dependency


DashboardViewer = Annotated[CurrentUser, Depends(require_permissions("dashboard.view"))]
MonitoringViewer = Annotated[CurrentUser, Depends(require_permissions("monitoring.view"))]
CameraViewer = Annotated[CurrentUser, Depends(require_permissions("cameras.view"))]
CameraEditor = Annotated[CurrentUser, Depends(require_permissions("cameras.update"))]
ViolationViewer = Annotated[CurrentUser, Depends(require_permissions("violations.view"))]
ViolationReviewer = Annotated[CurrentUser, Depends(require_permissions("violations.review"))]
ViolationConfirmer = Annotated[CurrentUser, Depends(require_permissions("violations.confirm"))]
ViolationRejecter = Annotated[CurrentUser, Depends(require_permissions("violations.reject"))]
VehicleViewer = Annotated[CurrentUser, Depends(require_permissions("vehicles.view"))]
AnalyticsViewer = Annotated[CurrentUser, Depends(require_permissions("analytics.view"))]
UserViewer = Annotated[CurrentUser, Depends(require_permissions("users.view"))]
SettingsViewer = Annotated[CurrentUser, Depends(require_permissions("settings.view"))]
