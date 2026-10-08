from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Cookie, Response, status

from app.api.deps import ClientDep, CurrentUserDep, DbSession, SettingsDep
from app.core.config import Settings
from app.core.errors import ErrorCode, UnauthorizedError
from app.models import User
from app.schemas.auth import LoginRequest, TokenResponse, UserProfile
from app.schemas.common import ApiResponse, error_responses
from app.services.auth import AuthService, IssuedTokens

router = APIRouter(prefix="/auth", tags=["Auth"])
COOKIE_PATH = "/api/v1/auth"
REFRESH_COOKIE = "st_refresh"


def _profile(user: User) -> UserProfile:
    return UserProfile(
        id=user.id,
        username=user.username,
        full_name=user.full_name,
        email=user.email,
        role=user.role.code,
        role_name=user.role.name,
        permissions=sorted(p.code for p in user.role.permissions),
    )


def _token_response(tokens: IssuedTokens, response: Response, settings: Settings) -> TokenResponse:
    response.set_cookie(
        REFRESH_COOKIE,
        tokens.refresh_token,
        max_age=int((tokens.refresh_expires_at - datetime.now(UTC)).total_seconds()),
        httponly=True,
        secure=settings.cookie_secure,
        samesite="strict",
        path=COOKIE_PATH,
    )
    return TokenResponse(
        access_token=tokens.access_token,
        expires_in=settings.jwt_expire_minutes * 60,
        expires_at=tokens.access_expires_at,
        user=_profile(tokens.user),
    )


@router.post(
    "/login",
    summary="Log in",
    description=(
        "Exchanges username/email and password for a JWT access token and sets the refresh "
        "token as an HttpOnly cookie. Accounts are locked for `LOGIN_LOCKOUT_MINUTES` after "
        "`LOGIN_MAX_ATTEMPTS` consecutive failures. **Authentication:** none."
    ),
    response_model=ApiResponse[TokenResponse],
    responses=error_responses(401, 403, 422),
)
async def login(
    body: LoginRequest,
    response: Response,
    session: DbSession,
    settings: SettingsDep,
    client: ClientDep,
) -> ApiResponse[TokenResponse]:
    tokens = await AuthService(session, settings).login(
        body.username_or_email, body.password, client
    )
    return ApiResponse(data=_token_response(tokens, response, settings))


@router.post(
    "/refresh",
    summary="Rotate the refresh token",
    description=(
        "Uses the refresh cookie to issue a new access token and a new refresh token. "
        "Re-using an already rotated refresh token revokes the whole session family."
    ),
    response_model=ApiResponse[TokenResponse],
    responses=error_responses(401),
)
async def refresh(
    response: Response,
    session: DbSession,
    settings: SettingsDep,
    client: ClientDep,
    st_refresh: Annotated[str | None, Cookie()] = None,
) -> ApiResponse[TokenResponse]:
    if not st_refresh:
        raise UnauthorizedError("Refresh cookie is missing", code=ErrorCode.TOKEN_INVALID)
    tokens = await AuthService(session, settings).refresh(st_refresh, client)
    return ApiResponse(data=_token_response(tokens, response, settings))


@router.post(
    "/logout",
    summary="Log out",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=error_responses(401),
)
async def logout(
    user: CurrentUserDep,
    session: DbSession,
    settings: SettingsDep,
    client: ClientDep,
    st_refresh: Annotated[str | None, Cookie()] = None,
) -> Response:
    await AuthService(session, settings).logout(st_refresh, user.id, client)
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    response.delete_cookie(REFRESH_COOKIE, path=COOKIE_PATH)
    return response


@router.post(
    "/logout-all",
    summary="Log out everywhere",
    description="Revokes every session and invalidates all access tokens of the current user.",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=error_responses(401),
)
async def logout_all(
    user: CurrentUserDep, session: DbSession, settings: SettingsDep, client: ClientDep
) -> Response:
    await AuthService(session, settings).logout_all(user.id, client)
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    response.delete_cookie(REFRESH_COOKIE, path=COOKIE_PATH)
    return response


@router.get(
    "/me",
    summary="Current user",
    response_model=ApiResponse[UserProfile],
    responses=error_responses(401),
)
async def me(user: CurrentUserDep) -> ApiResponse[UserProfile]:
    return ApiResponse(
        data=UserProfile(
            id=user.id,
            username=user.username,
            full_name=user.full_name,
            email=user.email,
            role=user.role_code,
            role_name=user.role_name,
            permissions=sorted(user.permissions),
        )
    )
