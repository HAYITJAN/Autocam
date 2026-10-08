import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import Settings
from app.core.errors import ErrorCode, ForbiddenError, UnauthorizedError
from app.core.security import (
    burn_password_check,
    create_access_token,
    hash_token,
    new_opaque_token,
    verify_password,
)
from app.models import Role, User, UserSession
from app.models.enums import UserStatus
from app.services.audit import ClientInfo, record_audit


@dataclass(frozen=True, slots=True)
class IssuedTokens:
    user: User
    access_token: str
    access_expires_at: datetime
    refresh_token: str
    refresh_expires_at: datetime


def _invalid_credentials() -> UnauthorizedError:
    return UnauthorizedError("Invalid username or password", code=ErrorCode.INVALID_CREDENTIALS)


def _invalid_refresh() -> UnauthorizedError:
    return UnauthorizedError("Session is invalid or expired", code=ErrorCode.TOKEN_INVALID)


async def load_user_with_permissions(session: AsyncSession, user_id: int) -> User | None:
    return await session.scalar(
        select(User)
        .options(selectinload(User.role).selectinload(Role.permissions))
        .where(User.id == user_id, User.deleted_at.is_(None))
    )


class AuthService:
    def __init__(self, session: AsyncSession, settings: Settings) -> None:
        self.session = session
        self.settings = settings

    async def login(self, login: str, password: str, client: ClientInfo) -> IssuedTokens:
        now = datetime.now(UTC)
        normalized = login.strip().lower()
        user = await self.session.scalar(
            select(User)
            .options(selectinload(User.role).selectinload(Role.permissions))
            .where(
                User.deleted_at.is_(None),
                or_(func.lower(User.username) == normalized, func.lower(User.email) == normalized),
            )
            .with_for_update(of=User)
        )
        if user is None:
            burn_password_check(password)
            record_audit(
                self.session,
                "LOGIN_FAILED",
                user_id=None,
                client=client,
                meta={"login": normalized[:100], "reason": "unknown_user"},
            )
            await self.session.commit()
            raise _invalid_credentials()

        if user.locked_until and user.locked_until > now:
            burn_password_check(password)
            raise ForbiddenError(
                "Account is temporarily locked after repeated failed logins",
                code=ErrorCode.ACCOUNT_LOCKED,
                details={"locked_until": user.locked_until.isoformat()},
            )

        if not verify_password(password, user.password_hash):
            user.failed_login_attempts += 1
            reason = "bad_password"
            if user.failed_login_attempts >= self.settings.login_max_attempts:
                user.locked_until = now + timedelta(minutes=self.settings.login_lockout_minutes)
                user.failed_login_attempts = 0
                reason = "locked"
                record_audit(self.session, "ACCOUNT_LOCKED", user_id=user.id, client=client)
            record_audit(
                self.session,
                "LOGIN_FAILED",
                user_id=user.id,
                client=client,
                meta={"reason": reason},
            )
            await self.session.commit()
            raise _invalid_credentials()

        if user.status is not UserStatus.ACTIVE:
            raise ForbiddenError("Account is not active", code=ErrorCode.ACCOUNT_DISABLED)

        user.failed_login_attempts = 0
        user.locked_until = None
        user.last_login = now
        tokens = self._issue(user, family_id=uuid.uuid4(), client=client, now=now)
        record_audit(self.session, "LOGIN_SUCCESS", user_id=user.id, client=client)
        await self.session.commit()
        return tokens

    async def refresh(self, refresh_token: str, client: ClientInfo) -> IssuedTokens:
        now = datetime.now(UTC)
        current = await self.session.scalar(
            select(UserSession)
            .where(UserSession.refresh_token_hash == hash_token(refresh_token))
            .with_for_update()
        )
        if current is None:
            raise _invalid_refresh()
        if current.revoked_at is not None:
            # A rotated token was presented again: assume theft and kill the whole family.
            await self.session.execute(
                update(UserSession)
                .where(UserSession.family_id == current.family_id, UserSession.revoked_at.is_(None))
                .values(revoked_at=now)
            )
            record_audit(
                self.session,
                "TOKEN_REUSE_DETECTED",
                user_id=current.user_id,
                client=client,
                meta={"family_id": str(current.family_id)},
            )
            await self.session.commit()
            raise _invalid_refresh()
        if current.expires_at <= now:
            raise _invalid_refresh()

        user = await load_user_with_permissions(self.session, current.user_id)
        if user is None or user.status is not UserStatus.ACTIVE:
            raise _invalid_refresh()

        current.revoked_at = now
        tokens = self._issue(user, family_id=current.family_id, client=client, now=now)
        await self.session.commit()
        return tokens

    async def logout(self, refresh_token: str | None, user_id: int, client: ClientInfo) -> None:
        if refresh_token:
            await self.session.execute(
                update(UserSession)
                .where(
                    UserSession.refresh_token_hash == hash_token(refresh_token),
                    UserSession.user_id == user_id,
                    UserSession.revoked_at.is_(None),
                )
                .values(revoked_at=datetime.now(UTC))
            )
        record_audit(self.session, "LOGOUT", user_id=user_id, client=client)
        await self.session.commit()

    async def logout_all(self, user_id: int, client: ClientInfo) -> None:
        await self.session.execute(
            update(UserSession)
            .where(UserSession.user_id == user_id, UserSession.revoked_at.is_(None))
            .values(revoked_at=datetime.now(UTC))
        )
        await self.session.execute(
            update(User).where(User.id == user_id).values(token_version=User.token_version + 1)
        )
        record_audit(self.session, "LOGOUT_ALL", user_id=user_id, client=client)
        await self.session.commit()

    def _issue(
        self, user: User, *, family_id: uuid.UUID, client: ClientInfo, now: datetime
    ) -> IssuedTokens:
        refresh_token = new_opaque_token()
        refresh_expires = now + timedelta(days=self.settings.jwt_refresh_expire_days)
        session_row = UserSession(
            id=uuid.uuid4(),
            user_id=user.id,
            family_id=family_id,
            refresh_token_hash=hash_token(refresh_token),
            ip_address=client.ip_address,
            user_agent=client.user_agent,
            created_at=now,
            last_used_at=now,
            expires_at=refresh_expires,
        )
        self.session.add(session_row)
        access_token, access_expires = create_access_token(
            user_id=user.id,
            token_version=user.token_version,
            session_id=str(session_row.id),
            secret=self.settings.jwt_secret.get_secret_value(),
            algorithm=self.settings.jwt_algorithm,
            expires_minutes=self.settings.jwt_expire_minutes,
            now=now,
        )
        return IssuedTokens(user, access_token, access_expires, refresh_token, refresh_expires)
