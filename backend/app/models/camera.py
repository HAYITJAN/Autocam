from datetime import datetime
from typing import Any

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    Numeric,
    Sequence,
    SmallInteger,
    String,
    Text,
    func,
    text,
    true,
)
from sqlalchemy.dialects.postgresql import INET
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, SoftDeleteMixin, TimestampMixin
from app.db.types import Coordinate, Degrees, IdentityPK, Percent, json_column, pg_enum
from app.models.enums import (
    CameraStatus,
    CameraType,
    ConnectionStatus,
    ConnectionType,
    NetworkEvent,
    TrafficLightSource,
    TrafficLightState,
    ZoneType,
)
from app.models.geo import Location

CAMERA_HEALTH_LOG_ID_SEQ = Sequence("camera_health_logs_id_seq")


class Camera(IdentityPK, TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "cameras"
    __table_args__: Any = (
        CheckConstraint("confidence_threshold BETWEEN 0 AND 1", name="confidence_threshold_range"),
        CheckConstraint("fps_target BETWEEN 1 AND 120", name="fps_target_range"),
        CheckConstraint("retention_days BETWEEN 1 AND 3650", name="retention_days_range"),
        CheckConstraint("port IS NULL OR port BETWEEN 1 AND 65535", name="port_range"),
    )

    code: Mapped[str] = mapped_column(String(20), unique=True)
    name: Mapped[str] = mapped_column(String(150))
    location_id: Mapped[int] = mapped_column(
        ForeignKey("locations.id", ondelete="RESTRICT"), index=True
    )
    camera_type: Mapped[CameraType] = mapped_column(
        pg_enum(CameraType, "camera_type"), default=CameraType.FIXED
    )
    status: Mapped[CameraStatus] = mapped_column(
        pg_enum(CameraStatus, "camera_status"),
        default=CameraStatus.OFFLINE,
        server_default=CameraStatus.OFFLINE.value,
        index=True,
    )
    is_enabled: Mapped[bool] = mapped_column(default=True, server_default=true())
    ip_address: Mapped[str | None] = mapped_column(INET)
    port: Mapped[int | None] = mapped_column(Integer)
    mac_address: Mapped[str | None] = mapped_column(String(17))
    rtsp_url: Mapped[str | None] = mapped_column(String(500))
    username: Mapped[str | None] = mapped_column(String(100))
    password_encrypted: Mapped[bytes | None] = mapped_column(LargeBinary)
    resolution: Mapped[str] = mapped_column(
        String(20), default="1920x1080", server_default="1920x1080"
    )
    fps_target: Mapped[int] = mapped_column(SmallInteger, default=25, server_default="25")
    ai_enabled: Mapped[bool] = mapped_column(default=True, server_default=true())
    recording_enabled: Mapped[bool] = mapped_column(default=True, server_default=true())
    retention_days: Mapped[int] = mapped_column(SmallInteger, default=30, server_default="30")
    confidence_threshold: Mapped[float] = mapped_column(
        Numeric(4, 3, asdecimal=False), default=0.5, server_default="0.5"
    )
    ai_model_id: Mapped[int | None] = mapped_column(
        ForeignKey("ai_models.id", ondelete="SET NULL"), index=True
    )
    speed_limit_kmh: Mapped[int] = mapped_column(SmallInteger, default=60, server_default="60")
    road_direction_deg: Mapped[float | None] = mapped_column(Degrees)
    # Mounting point on the road; NULL means the camera sits at its location's point.
    latitude: Mapped[float | None] = mapped_column(Coordinate)
    longitude: Mapped[float | None] = mapped_column(Coordinate)
    ai_config: Mapped[dict[str, Any]] = json_column()
    installed_at: Mapped[datetime | None]
    last_heartbeat_at: Mapped[datetime | None] = mapped_column(index=True)

    location: Mapped[Location] = relationship(lazy="raise")
    connections: Mapped[list["CameraConnection"]] = relationship(
        back_populates="camera", lazy="raise", cascade="all, delete-orphan"
    )


class CameraConnection(IdentityPK, TimestampMixin, Base):
    __tablename__ = "camera_connections"
    __table_args__: Any = (
        Index(
            "uq_camera_connections_primary",
            "camera_id",
            unique=True,
            postgresql_where=text("is_primary"),
        ),
    )

    camera_id: Mapped[int] = mapped_column(ForeignKey("cameras.id", ondelete="CASCADE"), index=True)
    connection_type: Mapped[ConnectionType] = mapped_column(
        pg_enum(ConnectionType, "connection_type")
    )
    is_primary: Mapped[bool] = mapped_column(default=True, server_default=true())
    ssid_or_apn: Mapped[str | None] = mapped_column(String(100))
    operator: Mapped[str | None] = mapped_column(String(100))
    ip_address: Mapped[str | None] = mapped_column(INET)
    status: Mapped[ConnectionStatus] = mapped_column(
        pg_enum(ConnectionStatus, "connection_status"),
        default=ConnectionStatus.DISCONNECTED,
        server_default=ConnectionStatus.DISCONNECTED.value,
    )
    signal_strength_dbm: Mapped[int | None] = mapped_column(SmallInteger)
    bandwidth_mbps: Mapped[float | None] = mapped_column(Numeric(8, 2, asdecimal=False))
    config: Mapped[dict[str, Any]] = json_column()

    camera: Mapped[Camera] = relationship(back_populates="connections", lazy="raise")


class CameraHealthLog(Base):
    """High-volume heartbeat samples; range-partitioned by month on `recorded_at`."""

    __tablename__ = "camera_health_logs"
    __table_args__: Any = (
        Index("ix_camera_health_logs_camera_recorded", "camera_id", text("recorded_at DESC")),
        {"postgresql_partition_by": "RANGE (recorded_at)"},
    )

    id: Mapped[int] = mapped_column(
        BigInteger,
        CAMERA_HEALTH_LOG_ID_SEQ,
        server_default=CAMERA_HEALTH_LOG_ID_SEQ.next_value(),
        primary_key=True,
    )
    recorded_at: Mapped[datetime] = mapped_column(primary_key=True, server_default=func.now())
    camera_id: Mapped[int] = mapped_column(ForeignKey("cameras.id", ondelete="CASCADE"))
    status: Mapped[CameraStatus] = mapped_column(pg_enum(CameraStatus, "camera_status"))
    fps: Mapped[float | None] = mapped_column(Percent)
    latency_ms: Mapped[int | None] = mapped_column(Integer)
    cpu_percent: Mapped[float | None] = mapped_column(Percent)
    temperature_c: Mapped[float | None] = mapped_column(Percent)
    signal_strength_dbm: Mapped[int | None] = mapped_column(SmallInteger)
    packet_loss_pct: Mapped[float | None] = mapped_column(Percent)
    uptime_seconds: Mapped[int | None] = mapped_column(BigInteger)


class NetworkLog(IdentityPK, Base):
    __tablename__ = "network_logs"
    __table_args__: Any = (
        Index("ix_network_logs_camera_recorded", "camera_id", text("recorded_at DESC")),
    )

    camera_id: Mapped[int] = mapped_column(ForeignKey("cameras.id", ondelete="CASCADE"))
    connection_id: Mapped[int | None] = mapped_column(
        ForeignKey("camera_connections.id", ondelete="SET NULL"), index=True
    )
    recorded_at: Mapped[datetime] = mapped_column(server_default=func.now())
    network_type: Mapped[ConnectionType] = mapped_column(pg_enum(ConnectionType, "connection_type"))
    event: Mapped[NetworkEvent] = mapped_column(pg_enum(NetworkEvent, "network_event"))
    signal_strength_dbm: Mapped[int | None] = mapped_column(SmallInteger)
    latency_ms: Mapped[int | None] = mapped_column(Integer)
    packet_loss_pct: Mapped[float | None] = mapped_column(Percent)
    message: Mapped[str | None] = mapped_column(Text)


class TrafficZone(IdentityPK, TimestampMixin, Base):
    __tablename__ = "traffic_zones"

    camera_id: Mapped[int] = mapped_column(ForeignKey("cameras.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(100))
    zone_type: Mapped[ZoneType] = mapped_column(pg_enum(ZoneType, "zone_type"))
    geometry: Mapped[dict[str, Any]] = json_column()
    config: Mapped[dict[str, Any]] = json_column()
    is_active: Mapped[bool] = mapped_column(default=True, server_default=true())


class TrafficLight(IdentityPK, TimestampMixin, Base):
    __tablename__ = "traffic_lights"

    code: Mapped[str] = mapped_column(String(30), unique=True)
    camera_id: Mapped[int | None] = mapped_column(
        ForeignKey("cameras.id", ondelete="SET NULL"), index=True
    )
    location_id: Mapped[int | None] = mapped_column(
        ForeignKey("locations.id", ondelete="SET NULL"), index=True
    )
    source: Mapped[TrafficLightSource] = mapped_column(
        pg_enum(TrafficLightSource, "traffic_light_source"), default=TrafficLightSource.SIMULATED
    )
    roi: Mapped[dict[str, Any] | None] = json_column(nullable=True)
    controller_url: Mapped[str | None] = mapped_column(String(500))
    current_state: Mapped[TrafficLightState] = mapped_column(
        pg_enum(TrafficLightState, "traffic_light_state"),
        default=TrafficLightState.UNKNOWN,
        server_default=TrafficLightState.UNKNOWN.value,
    )
    state_changed_at: Mapped[datetime | None]
