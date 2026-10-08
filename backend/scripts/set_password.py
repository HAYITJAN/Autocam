"""Set users' passwords from the command line (prompted, never echoed or logged).

Run from the backend directory:

    python -m scripts.set_password admin
    python -m scripts.set_password --demo                               # every demo user
    python -m scripts.set_password --demo --from-env SEED_DEMO_PASSWORD  # non-interactive

Also clears a login lockout and signs the user out of every existing session. Users whose
password already matches are left untouched, so the non-interactive form is safe to rerun.
"""

import argparse
import asyncio
import getpass
import os
import sys
from datetime import UTC, datetime
from typing import Literal

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password, verify_password
from app.db.session import dispose_engine, get_sessionmaker
from app.models import User, UserSession
from app.seed.base import MIN_PASSWORD_LENGTH
from scripts.seed_database import DEMO_USERS

Outcome = Literal["updated", "unchanged", "not found"]


def check_length(password: str) -> str:
    if len(password) < MIN_PASSWORD_LENGTH:
        raise ValueError(f"Password must be at least {MIN_PASSWORD_LENGTH} characters")
    return password


def read_password() -> str:
    password = check_length(getpass.getpass("New password: "))
    if getpass.getpass("Repeat password: ") != password:
        raise ValueError("Passwords do not match")
    return password


def password_from_env(name: str) -> str:
    password = os.environ.get(name)
    if not password:
        raise ValueError(f"{name} is not set")
    return check_length(password)


async def set_passwords(
    session: AsyncSession, usernames: list[str], password: str
) -> dict[str, Outcome]:
    outcomes: dict[str, Outcome] = {}
    for username in usernames:
        user = await session.scalar(
            select(User).where(User.username == username, User.deleted_at.is_(None))
        )
        if user is None:
            outcomes[username] = "not found"
            continue
        if verify_password(password, user.password_hash):
            outcomes[username] = "unchanged"
            continue
        user.password_hash = hash_password(password)
        user.failed_login_attempts = 0
        user.locked_until = None
        user.token_version += 1
        await session.execute(
            update(UserSession)
            .where(UserSession.user_id == user.id, UserSession.revoked_at.is_(None))
            .values(revoked_at=datetime.now(UTC))
        )
        outcomes[username] = "updated"
    return outcomes


async def run(usernames: list[str], password: str) -> dict[str, Outcome]:
    try:
        async with get_sessionmaker()() as session, session.begin():
            return await set_passwords(session, usernames, password)
    finally:
        await dispose_engine()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0] if __doc__ else None)
    parser.add_argument("usernames", nargs="*")
    parser.add_argument("--demo", action="store_true", help="include every demo user")
    parser.add_argument("--from-env", metavar="VAR", help="read the password from this variable")
    args = parser.parse_args()
    usernames = list(
        dict.fromkeys(args.usernames + ([n for n, _, _ in DEMO_USERS] if args.demo else []))
    )
    if not usernames:
        parser.error("give at least one username or --demo")
    try:
        password = password_from_env(args.from_env) if args.from_env else read_password()
    except ValueError as exc:
        print(exc, file=sys.stderr)
        sys.exit(1)
    outcomes = asyncio.run(run(usernames, password))
    for username, outcome in outcomes.items():
        print(
            f"{username}: password {outcome}"
            if outcome != "not found"
            else f"{username}: not found"
        )
    if "not found" in outcomes.values():
        sys.exit(1)


if __name__ == "__main__":
    main()
