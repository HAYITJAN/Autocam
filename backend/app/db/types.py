from enum import StrEnum
from functools import cache
from typing import Any

from sqlalchemy import BigInteger, Identity, Numeric
from sqlalchemy.dialects.postgresql import ENUM, JSONB
from sqlalchemy.orm import Mapped, mapped_column


@cache
def pg_enum(enum_cls: type[StrEnum], name: str) -> ENUM:
    """One shared PostgreSQL ENUM type per Python enum, stored by value."""
    return ENUM(
        enum_cls,
        name=name,
        values_callable=lambda members: [member.value for member in members],
        validate_strings=True,
    )


def json_column(name: str | None = None, *, nullable: bool = False) -> Mapped[Any]:
    return mapped_column(
        name,
        JSONB,
        nullable=nullable,
        default=None if nullable else dict,
        server_default=None if nullable else "{}",
    )


Coordinate = Numeric(9, 6, asdecimal=False)
Confidence = Numeric(5, 4, asdecimal=False)
Percent = Numeric(5, 2, asdecimal=False)
Speed = Numeric(6, 2, asdecimal=False)
Degrees = Numeric(5, 2, asdecimal=False)


class IdentityPK:
    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
