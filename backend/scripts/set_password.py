"""Set a user's password from the command line (prompted, never echoed or logged).

Run from the backend directory:

    python -m scripts.set_password admin

Also clears a login lockout and signs the user out of every existing session.
"""

import argparse
import asyncio
import getpass
import sys
from datetime import UTC, datetime

from sqlalchemy import select, update

from app.core.security import hash_password
from app.db.session import dispose_engine, get_sessionmaker
from app.models import User, UserSession
from app.seed.base import MIN_PASSWORD_LENGTH


def read_password() -> str:
    password = getpass.getpass("New password: ")
    if len(password) < MIN_PASSWORD_LENGTH:
        raise ValueError(f"Password must be at least {MIN_PASSWORD_LENGTH} characters")
    if getpass.getpass("Repeat password: ") != password:
        raise ValueError("Passwords do not match")
    return password


async def set_password(username: str, password: str) -> bool:
    try:
        async with get_sessionmaker()() as session, session.begin():
            user = await session.scalar(
                select(User).where(User.username == username, User.deleted_at.is_(None))
            )
            if user is None:
                return False
            user.password_hash = hash_password(password)
            user.failed_login_attempts = 0
            user.locked_until = None
            user.token_version += 1
            await session.execute(
                update(UserSession)
                .where(UserSession.user_id == user.id, UserSession.revoked_at.is_(None))
                .values(revoked_at=datetime.now(UTC))
            )
    finally:
        await dispose_engine()
    return True


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0] if __doc__ else None)
    parser.add_argument("username")
    args = parser.parse_args()
    try:
        password = read_password()
    except ValueError as exc:
        print(exc, file=sys.stderr)
        sys.exit(1)
    if not asyncio.run(set_password(args.username, password)):
        print(f"User '{args.username}' not found", file=sys.stderr)
        sys.exit(1)
    print(f"Password updated for '{args.username}'")


if __name__ == "__main__":
    main()
