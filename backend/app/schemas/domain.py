"""Response/request models for the core domain (cameras, violations, vehicles, notifications)."""

from datetime import datetime
from typing import Any

from pydantic import Field

from app.models.enums import (
    CameraStatus,
    CameraType,
    ConnectionStatus,
    ConnectionType,
    LocationType,
    NotificationState,
    NotificationType,
    Severity,
    TrafficLightState,
    VehicleStatus,
    ViolationEventType,
    ViolationStatus,
    ZoneType,
)
from app.schemas.common import ApiModel

# ---------------------------------------------------------------- references


class DistrictRef(ApiModel):
    id: int
    code: str
    name: str


class LocationRef(ApiModel):
    id: int
    name: str
    location_type: LocationType
    latitude: float
    longitude: float
    district: DistrictRef


class ViolationTypeOut(ApiModel):
    id: int
    code: str
    name_uz: str
    name_en: str
    severity: Severity
    color: str
    icon: str | None
    fine_amount: float | None
    is_active: bool


class ViolationTypeRef(ApiModel):
    id: int
    code: str
    name_uz: str
    severity: Severity
    color: str


class VehicleTypeRef(ApiModel):
    id: int
    code: str
    name_uz: str
    color: str
    icon: str | None


class UserRef(ApiModel):
    id: int
    full_name: str
    username: str


class CameraRef(ApiModel):
    id: int
    code: str
    name: str


# ------------------------------------------------------------------- cameras


class CameraConnectionOut(ApiModel):
    id: int
    connection_type: ConnectionType
    is_primary: bool
    status: ConnectionStatus
    operator: str | None
    ssid_or_apn: str | None
    ip_address: str | None
    signal_strength_dbm: int | None
    bandwidth_mbps: float | None


class CameraMetrics(ApiModel):
    fps: float | None = None
    latency_ms: int | None = None
    cpu_percent: float | None = None
    temperature_c: float | None = None
    packet_loss_pct: float | None = None
    recorded_at: datetime | None = None


class CameraListItem(ApiModel):
    id: int
    code: str
    name: str
    status: CameraStatus
    camera_type: CameraType
    is_enabled: bool
    ai_enabled: bool
    location: LocationRef
    connection_type: ConnectionType | None
    signal_strength_dbm: int | None
    last_heartbeat_at: datetime | None
    metrics: CameraMetrics
    violations_today: int


class TrafficZoneOut(ApiModel):
    id: int
    name: str
    zone_type: ZoneType
    geometry: dict[str, Any]
    config: dict[str, Any]
    is_active: bool


class CameraDetail(CameraListItem):
    ip_address: str | None
    port: int | None
    mac_address: str | None
    rtsp_configured: bool
    resolution: str
    fps_target: int
    recording_enabled: bool
    retention_days: int
    confidence_threshold: float
    speed_limit_kmh: int
    road_direction_deg: float | None
    installed_at: datetime | None
    connections: list[CameraConnectionOut]
    zones: list[TrafficZoneOut]
    has_traffic_light: bool


class CameraSummary(ApiModel):
    total: int
    online: int
    offline: int
    warning: int
    maintenance: int


class SeriesPoint(ApiModel):
    t: datetime
    value: float | None


class CameraStatistics(ApiModel):
    range: str
    violations_total: int
    violations_series: list[SeriesPoint]
    fps_series: list[SeriesPoint]
    latency_series: list[SeriesPoint]
    uptime_pct: float | None
    by_type: list["TypeCount"]


# ---------------------------------------------------------------- violations


class ViolationListItem(ApiModel):
    id: int
    code: str
    status: ViolationStatus
    occurred_at: datetime
    plate_number: str | None
    ai_confidence: float
    detected_speed: float | None
    speed_limit: float | None
    type: ViolationTypeRef
    camera: CameraRef
    location_name: str | None
    district_name: str | None
    vehicle_type: VehicleTypeRef | None
    assigned_to: UserRef | None


class ViolationEventOut(ApiModel):
    id: int
    event_type: ViolationEventType
    from_status: ViolationStatus | None
    to_status: ViolationStatus | None
    actor: UserRef | None
    comment: str | None
    created_at: datetime


class VehicleBrief(ApiModel):
    id: int
    plate_number: str
    plate_display: str
    brand: str | None
    model: str | None
    color: str | None
    status: VehicleStatus
    total_violations: int


class EvidenceOut(ApiModel):
    id: int
    evidence_type: str
    mime_type: str
    width: int | None
    height: int | None
    captured_at: datetime


class ViolationDetail(ViolationListItem):
    excess_speed: float | None
    direction: str | None
    traffic_light_state: TrafficLightState | None
    track_id: str | None
    reviewed_by: UserRef | None
    reviewed_at: datetime | None
    rejection_reason: str | None
    created_at: datetime
    location: LocationRef | None
    vehicle: VehicleBrief | None
    evidence: list[EvidenceOut]
    events: list[ViolationEventOut]
    allowed_actions: list[str]
    meta: dict[str, Any]


class ViolationSummary(ApiModel):
    total: int
    confirmed: int
    pending: int
    rejected: int
    today: int
    yesterday: int
    this_week: int
    this_month: int
    today_delta_pct: float | None


class CommentRequest(ApiModel):
    comment: str = Field(min_length=1, max_length=2000)


class ConfirmRequest(ApiModel):
    comment: str | None = Field(default=None, max_length=2000)


class RejectRequest(ApiModel):
    reason: str = Field(min_length=3, max_length=500)


# ------------------------------------------------------------------ vehicles


class VehicleListItem(ApiModel):
    id: int
    plate_number: str
    plate_display: str
    vehicle_type: VehicleTypeRef | None
    brand: str | None
    model: str | None
    color: str | None
    status: VehicleStatus
    status_reason: str | None
    total_detections: int
    total_violations: int
    first_seen_at: datetime | None
    last_seen_at: datetime | None
    last_camera: CameraRef | None


class VehicleDetail(VehicleListItem):
    vin: str | None
    owner_name: str | None
    notes: str | None
    violations_by_type: list["TypeCount"]


class VehicleSummary(ApiModel):
    total: int
    active_24h: int
    with_violations: int
    blacklisted: int
    watchlist: int
    by_type: list["TypeCount"]


class VehicleStatusRequest(ApiModel):
    status: VehicleStatus
    reason: str | None = Field(default=None, max_length=500)


# ------------------------------------------------------------- notifications


class NotificationOut(ApiModel):
    id: int
    type: NotificationType
    category: str
    title: str
    message: str
    entity_type: str | None
    entity_id: str | None
    link: str | None
    payload: dict[str, Any]
    state: NotificationState
    read_at: datetime | None
    created_at: datetime


class UnreadCount(ApiModel):
    total: int
    by_type: dict[str, int]


# ------------------------------------------------------------------- shared


class TypeCount(ApiModel):
    code: str
    name: str
    color: str | None = None
    count: int
    pct: float


CameraStatistics.model_rebuild()
VehicleDetail.model_rebuild()
VehicleSummary.model_rebuild()
