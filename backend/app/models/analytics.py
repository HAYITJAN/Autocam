from datetime import date, datetime

from sqlalchemy import Date, ForeignKey, Integer, Numeric
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.types import Confidence, Speed, pg_enum
from app.models.enums import ViolationStatus


class TrafficStatsHourly(Base):
    __tablename__ = "traffic_stats_hourly"

    camera_id: Mapped[int] = mapped_column(
        ForeignKey("cameras.id", ondelete="CASCADE"), primary_key=True
    )
    hour_bucket: Mapped[datetime] = mapped_column(primary_key=True, index=True)
    vehicle_type_id: Mapped[int] = mapped_column(
        ForeignKey("vehicle_types.id", ondelete="CASCADE"), primary_key=True
    )
    vehicle_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    avg_speed_kmh: Mapped[float | None] = mapped_column(Speed)
    max_speed_kmh: Mapped[float | None] = mapped_column(Speed)


class ViolationStatsHourly(Base):
    __tablename__ = "violation_stats_hourly"

    camera_id: Mapped[int] = mapped_column(
        ForeignKey("cameras.id", ondelete="CASCADE"), primary_key=True
    )
    hour_bucket: Mapped[datetime] = mapped_column(primary_key=True, index=True)
    violation_type_id: Mapped[int] = mapped_column(
        ForeignKey("violation_types.id", ondelete="CASCADE"), primary_key=True
    )
    status: Mapped[ViolationStatus] = mapped_column(
        pg_enum(ViolationStatus, "violation_status"), primary_key=True
    )
    count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    avg_confidence: Mapped[float | None] = mapped_column(Confidence)


class CameraAvailabilityDaily(Base):
    __tablename__ = "camera_availability_daily"

    camera_id: Mapped[int] = mapped_column(
        ForeignKey("cameras.id", ondelete="CASCADE"), primary_key=True
    )
    day: Mapped[date] = mapped_column(Date, primary_key=True, index=True)
    online_seconds: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    offline_seconds: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    warning_seconds: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    avg_fps: Mapped[float | None] = mapped_column(Numeric(5, 2, asdecimal=False))
    avg_latency_ms: Mapped[float | None] = mapped_column(Numeric(8, 2, asdecimal=False))
