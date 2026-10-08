from datetime import datetime
from typing import Any

from sqlalchemy import BigInteger, ForeignKey, Index, Integer, Sequence, String, Text, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin
from app.db.types import Confidence, Degrees, IdentityPK, Speed, json_column, pg_enum
from app.models.enums import VehicleStatus

VEHICLE_DETECTION_ID_SEQ = Sequence("vehicle_detections_id_seq")


class VehicleType(IdentityPK, Base):
    __tablename__ = "vehicle_types"

    code: Mapped[str] = mapped_column(String(20), unique=True)
    name_uz: Mapped[str] = mapped_column(String(50))
    name_en: Mapped[str] = mapped_column(String(50))
    color: Mapped[str] = mapped_column(String(9))
    icon: Mapped[str | None] = mapped_column(String(50))


class Vehicle(IdentityPK, TimestampMixin, Base):
    """Plate search uses a pg_trgm GIN index created by the migration when the extension exists."""

    __tablename__ = "vehicles"
    __table_args__: Any = (
        Index("ix_vehicles_last_seen_at", text("last_seen_at DESC")),
        Index("uq_vehicles_vin", "vin", unique=True, postgresql_where=text("vin IS NOT NULL")),
    )

    plate_number: Mapped[str] = mapped_column(String(16), unique=True)
    plate_display: Mapped[str] = mapped_column(String(20))
    vehicle_type_id: Mapped[int | None] = mapped_column(
        ForeignKey("vehicle_types.id", ondelete="SET NULL"), index=True
    )
    brand: Mapped[str | None] = mapped_column(String(60))
    model: Mapped[str | None] = mapped_column(String(60))
    color: Mapped[str | None] = mapped_column(String(30))
    country: Mapped[str] = mapped_column(String(2), default="UZ", server_default="UZ")
    vin: Mapped[str | None] = mapped_column(String(17))
    owner_name: Mapped[str | None] = mapped_column(String(150))
    status: Mapped[VehicleStatus] = mapped_column(
        pg_enum(VehicleStatus, "vehicle_status"),
        default=VehicleStatus.NORMAL,
        server_default=VehicleStatus.NORMAL.value,
        index=True,
    )
    status_reason: Mapped[str | None] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text)
    first_seen_at: Mapped[datetime | None]
    last_seen_at: Mapped[datetime | None]
    last_camera_id: Mapped[int | None] = mapped_column(
        ForeignKey("cameras.id", ondelete="SET NULL"), index=True
    )
    total_detections: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    total_violations: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    image_key: Mapped[str | None] = mapped_column(String(500))

    vehicle_type: Mapped[VehicleType | None] = relationship(lazy="raise")


class VehicleDetection(Base):
    """One row per finished track; range-partitioned by month on `detected_at`."""

    __tablename__ = "vehicle_detections"
    __table_args__: Any = (
        Index("ix_vehicle_detections_camera_detected", "camera_id", text("detected_at DESC")),
        Index("ix_vehicle_detections_vehicle_detected", "vehicle_id", text("detected_at DESC")),
        Index("ix_vehicle_detections_detected_brin", "detected_at", postgresql_using="brin"),
        {"postgresql_partition_by": "RANGE (detected_at)"},
    )

    id: Mapped[int] = mapped_column(
        BigInteger,
        VEHICLE_DETECTION_ID_SEQ,
        server_default=VEHICLE_DETECTION_ID_SEQ.next_value(),
        primary_key=True,
    )
    detected_at: Mapped[datetime] = mapped_column(primary_key=True, server_default=func.now())
    camera_id: Mapped[int] = mapped_column(ForeignKey("cameras.id", ondelete="CASCADE"))
    vehicle_id: Mapped[int | None] = mapped_column(ForeignKey("vehicles.id", ondelete="SET NULL"))
    track_id: Mapped[str] = mapped_column(String(64))
    vehicle_type_id: Mapped[int | None] = mapped_column(
        ForeignKey("vehicle_types.id", ondelete="SET NULL")
    )
    plate_text: Mapped[str | None] = mapped_column(String(16))
    plate_confidence: Mapped[float | None] = mapped_column(Confidence)
    detection_confidence: Mapped[float] = mapped_column(Confidence)
    bbox: Mapped[dict[str, Any]] = json_column()
    speed_kmh: Mapped[float | None] = mapped_column(Speed)
    direction_deg: Mapped[float | None] = mapped_column(Degrees)
    image_key: Mapped[str | None] = mapped_column(String(500))
