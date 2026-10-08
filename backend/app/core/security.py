import hashlib
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import bcrypt
import jwt

# bcrypt only uses the first 72 bytes of input; longer passwords are rejected outright
# instead of being silently truncated.
BCRYPT_MAX_BYTES = 72
DEFAULT_BCRYPT_ROUNDS = 12
ACCESS_TOKEN_TYPE = "access"  # noqa: S105

# Verified against when the user does not exist, so both paths cost one bcrypt check.
_DUMMY_HASH = bcrypt.hashpw(b"timing-equaliser", bcrypt.gensalt(rounds=DEFAULT_BCRYPT_ROUNDS))


def hash_password(password: str, *, rounds: int = DEFAULT_BCRYPT_ROUNDS) -> str:
    encoded = password.encode("utf-8")
    if not encoded:
        raise ValueError("Password must not be empty")
    if len(encoded) > BCRYPT_MAX_BYTES:
        raise ValueError(f"Password must be at most {BCRYPT_MAX_BYTES} bytes")
    return bcrypt.hashpw(encoded, bcrypt.gensalt(rounds=rounds)).decode("ascii")


def verify_password(password: str, password_hash: str) -> bool:
    encoded = password.encode("utf-8")
    if not encoded or len(encoded) > BCRYPT_MAX_BYTES:
        return False
    try:
        return bcrypt.checkpw(encoded, password_hash.encode("ascii"))
    except ValueError:
        return False


def burn_password_check(password: str) -> None:
    verify_password(password, _DUMMY_HASH.decode("ascii"))


@dataclass(frozen=True, slots=True)
class AccessTokenClaims:
    user_id: int
    token_version: int
    session_id: str | None
    expires_at: datetime


def create_access_token(
    *,
    user_id: int,
    token_version: int,
    session_id: str | None,
    secret: str,
    algorithm: str,
    expires_minutes: int,
    now: datetime | None = None,
) -> tuple[str, datetime]:
    issued = now or datetime.now(UTC)
    expires = issued + timedelta(minutes=expires_minutes)
    payload = {
        "sub": str(user_id),
        "tv": token_version,
        "sid": session_id,
        "type": ACCESS_TOKEN_TYPE,
        "iat": int(issued.timestamp()),
        "exp": int(expires.timestamp()),
    }
    return jwt.encode(payload, secret, algorithm=algorithm), expires


def decode_access_token(token: str, *, secret: str, algorithm: str) -> AccessTokenClaims:
    """Raises `jwt.ExpiredSignatureError` / `jwt.InvalidTokenError` on bad tokens."""
    payload = jwt.decode(
        token, secret, algorithms=[algorithm], options={"require": ["sub", "exp", "iat"]}
    )
    if payload.get("type") != ACCESS_TOKEN_TYPE:
        raise jwt.InvalidTokenError("not an access token")
    try:
        user_id = int(payload["sub"])
        token_version = int(payload.get("tv", 0))
    except (TypeError, ValueError) as exc:
        raise jwt.InvalidTokenError("malformed claims") from exc
    session_id = payload.get("sid")
    return AccessTokenClaims(
        user_id=user_id,
        token_version=token_version,
        session_id=str(session_id) if session_id else None,
        expires_at=datetime.fromtimestamp(int(payload["exp"]), UTC),
    )


def new_opaque_token() -> str:
    return secrets.token_urlsafe(48)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
