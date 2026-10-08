from typing import Any

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin
from app.db.types import Coordinate, IdentityPK, json_column, pg_enum
from app.models.enums import LocationType


class District(IdentityPK, TimestampMixin, Base):
    __tablename__ = "districts"

    code: Mapped[str] = mapped_column(String(50), unique=True)
    name: Mapped[str] = mapped_column(String(100))
    center_lat: Mapped[float] = mapped_column(Coordinate)
    center_lng: Mapped[float] = mapped_column(Coordinate)
    boundary_geojson: Mapped[dict[str, Any] | None] = json_column(nullable=True)


class Location(IdentityPK, TimestampMixin, Base):
    __tablename__ = "locations"

    district_id: Mapped[int] = mapped_column(
        ForeignKey("districts.id", ondelete="RESTRICT"), index=True
    )
    name: Mapped[str] = mapped_column(String(200))
    address: Mapped[str | None] = mapped_column(String(300))
    location_type: Mapped[LocationType] = mapped_column(
        pg_enum(LocationType, "location_type"), default=LocationType.INTERSECTION
    )
    latitude: Mapped[float] = mapped_column(Coordinate)
    longitude: Mapped[float] = mapped_column(Coordinate)

    district: Mapped[District] = relationship(lazy="raise")
