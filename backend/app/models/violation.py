from datetime import datetime
from typing import Any

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    Sequence,
    String,
    Text,
    func,
    text,
    true,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin
from app.db.types import Confidence, IdentityPK, Speed, json_column, pg_enum
from app.models.camera import Camera
from app.models.enums import (
    EvidenceType,
    Severity,
    TrafficLightState,
    ViolationEventType,
    ViolationStatus,
)
from app.models.geo import Location
from app.models.vehicle import Vehicle, VehicleType

VIOLATION_CODE_SEQ = Sequence("violation_code_seq", metadata=Base.metadata)
VIOLATION_CODE_DEFAULT = text("'VL-' || lpad(nextval('violation_code_seq')::text, 6, '0')")


class ViolationType(IdentityPK, TimestampMixin, Base):
    __tablename__ = "violation_types"

    code: Mapped[str] = mapped_column(String(40), unique=True)
    name_uz: Mapped[str] = mapped_column(String(100))
    name_en: Mapped[str] = mapped_column(String(100))
    description: Mapped[str | None] = mapped_column(Text)
    severity: Mapped[Severity] = mapped_column(pg_enum(Severity, "severity"))
    fine_amount: Mapped[float | None] = mapped_column(Numeric(12, 2, asdecimal=False))
    color: Mapped[str] = mapped_column(String(9))
    icon: Mapped[str | None] = mapped_column(String(50))
    rule_params: Mapped[dict[str, Any]] = json_column()
    is_active: Mapped[bool] = mapped_column(default=True, server_default=true())


class Violation(IdentityPK, TimestampMixin, Base):
    """One detected violation event (camera = source, vehicle = object, type = grouping).

    Plate search uses a pg_trgm GIN index created by the migration when the extension exists.
    Repeated AI reports of the same event are folded into the original row
    (`duplicate_count`) instead of creating new events.
    """

    __tablename__ = "violations"
    __table_args__: Any = (
        CheckConstraint("ai_confidence BETWEEN 0 AND 1", name="ai_confidence_range"),
        CheckConstraint("excess_speed IS NULL OR excess_speed >= 0", name="excess_speed_positive"),
        CheckConstraint("duplicate_count >= 0", name="duplicate_count_positive"),
        Index(
            "ix_violations_dedup",
            "camera_id",
            "violation_type_id",
            "plate_number",
            text("occurred_at DESC"),
        ),
        Index("ix_violations_status_occurred", "status", text("occurred_at DESC")),
        Index("ix_violations_camera_occurred", "camera_id", text("occurred_at DESC")),
        Index("ix_violations_type_occurred", "violation_type_id", text("occurred_at DESC")),
        Index("ix_violations_location_occurred", "location_id", text("occurred_at DESC")),
        Index("ix_violations_vehicle_occurred", "vehicle_id", text("occurred_at DESC")),
        Index("ix_violations_assigned_status", "assigned_to", "status"),
        Index("ix_violations_occurred_at", text("occurred_at DESC")),
    )

    code: Mapped[str] = mapped_column(
        String(20), unique=True, server_default=VIOLATION_CODE_DEFAULT
    )
    violation_type_id: Mapped[int] = mapped_column(
        ForeignKey("violation_types.id", ondelete="RESTRICT")
    )
    camera_id: Mapped[int] = mapped_column(ForeignKey("cameras.id", ondelete="RESTRICT"))
    location_id: Mapped[int | None] = mapped_column(ForeignKey("locations.id", ondelete="SET NULL"))
    vehicle_id: Mapped[int | None] = mapped_column(ForeignKey("vehicles.id", ondelete="SET NULL"))
    vehicle_type_id: Mapped[int | None] = mapped_column(
        ForeignKey("vehicle_types.id", ondelete="SET NULL"), index=True
    )
    detection_id: Mapped[int | None] = mapped_column(BigInteger)
    zone_id: Mapped[int | None] = mapped_column(
        ForeignKey("traffic_zones.id", ondelete="SET NULL"), index=True
    )
    plate_number: Mapped[str | None] = mapped_column(String(16))
    track_id: Mapped[str | None] = mapped_column(String(64))
    status: Mapped[ViolationStatus] = mapped_column(
        pg_enum(ViolationStatus, "violation_status"),
        default=ViolationStatus.NEW,
        server_default=ViolationStatus.NEW.value,
    )
    ai_confidence: Mapped[float] = mapped_column(Confidence)
    detected_speed: Mapped[float | None] = mapped_column(Speed)
    speed_limit: Mapped[float | None] = mapped_column(Speed)
    excess_speed: Mapped[float | None] = mapped_column(Speed)
    direction: Mapped[str | None] = mapped_column(String(20))
    traffic_light_state: Mapped[TrafficLightState | None] = mapped_column(
        pg_enum(TrafficLightState, "traffic_light_state")
    )
    occurred_at: Mapped[datetime]
    assigned_to: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    reviewed_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    reviewed_at: Mapped[datetime | None]
    rejection_reason: Mapped[str | None] = mapped_column(Text)
    idempotency_key: Mapped[str | None] = mapped_column(String(200), unique=True)
    duplicate_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    meta: Mapped[dict[str, Any]] = json_column("metadata")

    violation_type: Mapped[ViolationType] = relationship(lazy="raise")
    camera: Mapped[Camera] = relationship(lazy="raise")
    location: Mapped[Location | None] = relationship(lazy="raise")
    vehicle: Mapped[Vehicle | None] = relationship(lazy="raise")
    vehicle_type: Mapped[VehicleType | None] = relationship(lazy="raise")
    evidence: Mapped[list["ViolationEvidence"]] = relationship(
        back_populates="violation", lazy="raise", cascade="all, delete-orphan"
    )


class ViolationEvidence(IdentityPK, Base):
    __tablename__ = "violation_evidence"

    violation_id: Mapped[int] = mapped_column(
        ForeignKey("violations.id", ondelete="CASCADE"), index=True
    )
    evidence_type: Mapped[EvidenceType] = mapped_column(pg_enum(EvidenceType, "evidence_type"))
    storage_backend: Mapped[str] = mapped_column(String(10))
    storage_key: Mapped[str] = mapped_column(String(500))
    mime_type: Mapped[str] = mapped_column(String(100))
    size_bytes: Mapped[int] = mapped_column(BigInteger)
    width: Mapped[int | None] = mapped_column(Integer)
    height: Mapped[int | None] = mapped_column(Integer)
    duration_s: Mapped[float | None] = mapped_column(Numeric(6, 2, asdecimal=False))
    sha256: Mapped[str] = mapped_column(String(64))
    annotations: Mapped[dict[str, Any]] = json_column()
    captured_at: Mapped[datetime]
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    violation: Mapped[Violation] = relationship(back_populates="evidence", lazy="raise")


class ViolationEvent(IdentityPK, Base):
    """Append-only timeline; comments are events with `event_type = COMMENT`."""

    __tablename__ = "violation_events"
    __table_args__: Any = (
        Index("ix_violation_events_violation_created", "violation_id", "created_at"),
    )

    violation_id: Mapped[int] = mapped_column(ForeignKey("violations.id", ondelete="CASCADE"))
    event_type: Mapped[ViolationEventType] = mapped_column(
        pg_enum(ViolationEventType, "violation_event_type")
    )
    from_status: Mapped[ViolationStatus | None] = mapped_column(
        pg_enum(ViolationStatus, "violation_status")
    )
    to_status: Mapped[ViolationStatus | None] = mapped_column(
        pg_enum(ViolationStatus, "violation_status")
    )
    actor_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    comment: Mapped[str | None] = mapped_column(Text)
    payload: Mapped[dict[str, Any]] = json_column()
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
