"""Event-centric violation statistics: camera = source, vehicle = object, type = grouping."""

from datetime import datetime

from pydantic import Field

from app.models.enums import Severity, VehicleStatus, ViolationStatus
from app.schemas.common import ApiModel
from app.schemas.domain import CameraRef, TypeCount, VehicleRef, VehicleTypeRef
from app.schemas.insights import Timeseries


class ViolationTypeStat(ApiModel):
    id: int
    code: str
    name: str
    name_en: str
    description: str | None
    severity: Severity
    color: str
    icon: str | None
    is_active: bool
    count: int = Field(description="Violation events of this type (not vehicles)")
    unique_vehicles: int = Field(description="Distinct recognised vehicles among these events")
    pct: float = Field(description="Share of all events matching the filters, %")
    avg_confidence: float | None
    pending: int
    confirmed: int
    last_at: datetime | None


class CameraStat(ApiModel):
    id: int
    code: str
    name: str
    district: str | None
    count: int
    unique_vehicles: int


class StatusCount(ApiModel):
    status: ViolationStatus
    count: int


class ViolationStatistics(ApiModel):
    date_from: datetime
    date_to: datetime
    total_vehicles: int = Field(
        description="Vehicles that passed the selected cameras (traffic counters), "
        "independent of violation-only filters"
    )
    unique_vehicles: int = Field(description="Distinct plates read by the selected cameras")
    total_violations: int = Field(description="Violation events matching all filters")
    unique_violators: int = Field(description="Distinct vehicles with at least one event")
    repeat_violators: int = Field(description="Distinct vehicles with more than one event")
    unrecognized_plates: int = Field(description="Events whose plate could not be read")
    avg_confidence: float | None
    violation_rate_pct: float | None = Field(
        description="Violation events per 100 passing vehicles"
    )
    by_status: list[StatusCount]
    by_type: list[ViolationTypeStat]
    by_camera: list[CameraStat]
    by_hour: list[int] = Field(description="Events per local hour of day (24 values)")
    series: Timeseries


class ViolationTypeDetail(ApiModel):
    type: ViolationTypeStat
    by_status: list[StatusCount]
    by_camera: list[CameraStat]
    by_hour: list[int]
    series: Timeseries


class ViolatorItem(ApiModel):
    vehicle: VehicleRef
    vehicle_type: VehicleTypeRef | None
    status: VehicleStatus
    violations: int = Field(description="Events matching the filters")
    first_at: datetime
    last_at: datetime
    avg_confidence: float | None
    last_camera: CameraRef | None
    types: list[TypeCount]
