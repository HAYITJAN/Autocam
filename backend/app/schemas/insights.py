"""Dashboard, analytics and map response models."""

from datetime import datetime
from enum import StrEnum

from pydantic import Field

from app.models.enums import CameraStatus
from app.schemas.common import ApiModel
from app.schemas.domain import TypeCount, ViolationListItem
from app.schemas.system import ComponentHealth


class TimeRange(StrEnum):
    H24 = "24h"
    D7 = "7d"
    D30 = "30d"


class Kpi(ApiModel):
    value: float
    delta_pct: float | None = None
    secondary: float | None = None
    sparkline: list[float] = Field(default_factory=list)


class DashboardKpis(ApiModel):
    total_vehicles: Kpi
    active_cameras: Kpi
    total_cameras: int
    violations_today: Kpi
    confirmed_today: Kpi
    pending_today: Kpi
    uptime_pct: Kpi
    generated_at: datetime


class NamedSeries(ApiModel):
    code: str
    name: str
    color: str | None
    values: list[int]


class Timeseries(ApiModel):
    range: str
    bucket: str
    buckets: list[datetime]
    series: list[NamedSeries]
    totals: list[int]


class Distribution(ApiModel):
    range: str
    total: int
    items: list[TypeCount]


class SystemStatus(ApiModel):
    components: list[ComponentHealth]
    cameras_online: int
    cameras_total: int
    server_time: datetime


class RecentViolations(ApiModel):
    items: list[ViolationListItem]


class AnalyticsOverview(ApiModel):
    date_from: datetime
    date_to: datetime
    total: int
    confirmed: int
    rejected: int
    pending: int
    archived: int
    avg_per_day: float
    accuracy_pct: float | None
    total_delta_pct: float | None
    vehicles_involved: int
    top_type: TypeCount | None


class HourBucket(ApiModel):
    hour: int
    count: int


class HeatCell(ApiModel):
    weekday: int
    hour: int
    count: int


class RankedItem(ApiModel):
    id: int
    label: str
    sublabel: str | None = None
    count: int


class CameraPerformance(ApiModel):
    id: int
    code: str
    name: str
    status: CameraStatus
    uptime_pct: float | None
    avg_fps: float | None
    avg_latency_ms: float | None
    violations: int
    confirmed: int
    rejected: int


class ReviewOutcomeDay(ApiModel):
    day: datetime
    confirmed: int
    rejected: int


class ReviewOutcomes(ApiModel):
    days: list[ReviewOutcomeDay]
    rejection_reasons: list[TypeCount]
    accuracy_by_type: list[TypeCount]


class MapCamera(ApiModel):
    id: int
    code: str
    name: str
    status: CameraStatus
    latitude: float
    longitude: float
    location_name: str
    district_name: str
    violations_today: int


class HeatPoint(ApiModel):
    latitude: float
    longitude: float
    weight: int
    location_name: str


class MapDistrict(ApiModel):
    id: int
    code: str
    name: str
    center_lat: float
    center_lng: float
    violations: int
    cameras: int
