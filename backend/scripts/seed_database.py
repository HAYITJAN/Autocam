"""Seed the SMART TRAFFIC database (idempotent).

Run from the backend directory after `alembic upgrade head`:

    python -m scripts.seed_database            # reference data, cameras, admin user
    python -m scripts.seed_database --demo     # + demo users and 30 days of demo history

Passwords are read from SEED_ADMIN_PASSWORD / SEED_DEMO_PASSWORD. Outside production a
random password is generated and printed once when a user is created without one.
"""

import argparse
import asyncio
import os
import random
import sys
from datetime import UTC, datetime

from app.core.config import get_settings
from app.db.session import dispose_engine, get_sessionmaker
from app.seed.base import UserSeed, seed_base
from app.seed.demo import seed_demo
from app.seed.reference import ADMIN_ROLE

DEMO_USERS = (
    ("supervisor", "SUPERVISOR", "Demo Nazoratchi"),
    ("operator", "OPERATOR", "Demo Operator"),
    ("analyst", "ANALYST", "Demo Tahlilchi"),
    ("viewer", "VIEWER", "Demo Kuzatuvchi"),
)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0] if __doc__ else None)
    parser.add_argument("--demo", action="store_true", help="also load demo users and history")
    parser.add_argument("--seed", type=int, default=42, help="random seed for demo data")
    parser.add_argument("--days", type=int, default=30, help="days of demo violation history")
    parser.add_argument("--vehicles", type=int, default=2000, help="number of demo vehicles")
    parser.add_argument("--admin-username", default="admin")
    parser.add_argument("--admin-email", default="admin@smart-traffic.local")
    return parser.parse_args(argv)


async def run(args: argparse.Namespace) -> int:
    settings = get_settings()
    if args.demo and settings.is_production:
        print("Refusing to load demo data with APP_ENV=production.", file=sys.stderr)
        return 2

    users = [
        UserSeed(
            args.admin_username,
            args.admin_email,
            "Tizim administratori",
            ADMIN_ROLE,
            os.environ.get("SEED_ADMIN_PASSWORD") or None,
        )
    ]
    if args.demo:
        demo_password = os.environ.get("SEED_DEMO_PASSWORD") or None
        users += [
            UserSeed(name, f"{name}@smart-traffic.local", full_name, role, demo_password)
            for name, role, full_name in DEMO_USERS
        ]

    try:
        async with get_sessionmaker()() as session, session.begin():
            report = await seed_base(
                session, users=users, allow_generated_passwords=not settings.is_production
            )
            demo = (
                await seed_demo(
                    session,
                    rng=random.Random(args.seed),  # noqa: S311  (deterministic demo data)
                    now=datetime.now(UTC),
                    days=args.days,
                    vehicle_count=args.vehicles,
                )
                if args.demo
                else None
            )
    except ValueError as exc:
        print(f"Seed failed: {exc}", file=sys.stderr)
        return 1
    finally:
        await dispose_engine()

    created = {key: count for key, count in report.created.items() if count}
    print("Base seed:", ", ".join(f"{k}={v}" for k, v in created.items()) or "nothing new")
    if demo is not None:
        if demo.skipped_reason:
            print(f"Demo seed skipped: {demo.skipped_reason}")
        else:
            print("Demo seed:", ", ".join(f"{k}={v}" for k, v in demo.created.items()))
    for username, password in report.generated_passwords.items():
        print(f"Generated password for '{username}': {password}  (shown once, change after login)")
    return 0


def main() -> None:
    sys.exit(asyncio.run(run(parse_args())))


if __name__ == "__main__":
    main()
