"""Dashboard, analytics and map endpoints (read-only aggregations)."""

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Query
from sqlalchemy import func, select

from app.api.deps import (
    AnalyticsViewer,
    CurrentUserDep,
    DashboardViewer,
    DbSession,
    HealthServiceDep,
    MonitoringViewer,
    ViolationViewer,
)
from app.api.params import PeriodDep, TzDep
from app.models import Camera
from app.models.enums import CameraStatus
from app.schemas.common import ApiResponse, error_responses
from app.schemas.domain import NotificationOut, ViolationListItem
from app.schemas.insights import (
    AnalyticsOverview,
    CameraPerformance,
    DashboardKpis,
    Distribution,
    HeatCell,
    HeatPoint,
    HourBucket,
    MapCamera,
    MapDistrict,
    RankedItem,
    ReviewOutcomes,
    SystemStatus,
    TimeRange,
    Timeseries,
)
from app.services.insights import InsightsService
from app.services.notifications import NotificationService
from app.services.timeutil import window_for
from app.services.violations import ViolationService

AUTH_ERRORS = error_responses(401, 403)
TopLimit = Annotated[int, Query(ge=1, le=50)]

dashboard = APIRouter(prefix="/dashboard", tags=["Dashboard"])
analytics = APIRouter(prefix="/analytics", tags=["Analytics"])
map_router = APIRouter(prefix="/map", tags=["Map"])


# ------------------------------------------------------------------ dashboard


@dashboard.get("/kpis", summary="Headline KPIs", response_model=ApiResponse[DashboardKpis],
               responses=AUTH_ERRORS)  # fmt: skip
async def kpis(_: DashboardViewer, session: DbSession, tz: TzDep) -> ApiResponse[DashboardKpis]:
    return ApiResponse(data=await InsightsService(session, tz).kpis(datetime.now(UTC)))


@dashboard.get(
    "/system-status",
    summary="Service and camera status",
    response_model=ApiResponse[SystemStatus],
    responses=AUTH_ERRORS,
)
async def system_status(
    _: DashboardViewer, session: DbSession, health: HealthServiceDep
) -> ApiResponse[SystemStatus]:
    readiness = await health.readiness()
    total, online = (
        await session.execute(
            select(func.count(), func.count().filter(Camera.status == CameraStatus.ONLINE)).where(
                Camera.deleted_at.is_(None)
            )
        )
    ).one()
    return ApiResponse(
        data=SystemStatus(
            components=readiness.components,
            cameras_online=online,
            cameras_total=total,
            server_time=datetime.now(UTC),
        )
    )


@dashboard.get(
    "/violations-timeseries",
    summary="Violations per hour/day by type",
    response_model=ApiResponse[Timeseries],
    responses=AUTH_ERRORS,
)
async def violations_timeseries(
    _: DashboardViewer,
    session: DbSession,
    tz: TzDep,
    range: TimeRange = TimeRange.D7,  # noqa: A002
) -> ApiResponse[Timeseries]:
    return ApiResponse(
        data=await InsightsService(session, tz).violations_timeseries(range, datetime.now(UTC))
    )


@dashboard.get(
    "/violation-types",
    summary="Violation type distribution",
    response_model=ApiResponse[Distribution],
    responses=AUTH_ERRORS,
)
async def violation_types(
    _: DashboardViewer,
    session: DbSession,
    tz: TzDep,
    range: TimeRange = TimeRange.D30,  # noqa: A002
) -> ApiResponse[Distribution]:
    now = datetime.now(UTC)
    window = window_for(range, now, tz)
    return ApiResponse(
        data=await InsightsService(session, tz).violation_type_distribution(
            window.start, now, range.value
        )
    )


@dashboard.get(
    "/vehicle-types",
    summary="Vehicle type distribution (vehicles seen in range)",
    response_model=ApiResponse[Distribution],
    responses=AUTH_ERRORS,
)
async def vehicle_types(
    _: DashboardViewer,
    session: DbSession,
    tz: TzDep,
    range: TimeRange = TimeRange.D30,  # noqa: A002
) -> ApiResponse[Distribution]:
    now = datetime.now(UTC)
    window = window_for(range, now, tz)
    return ApiResponse(
        data=await InsightsService(session, tz).vehicle_type_distribution(
            window.start, now, range.value
        )
    )


@dashboard.get(
    "/recent-violations",
    summary="Latest violations",
    response_model=ApiResponse[list[ViolationListItem]],
    responses=AUTH_ERRORS,
)
async def recent_violations(
    _: DashboardViewer, session: DbSession, limit: Annotated[int, Query(ge=1, le=20)] = 5
) -> ApiResponse[list[ViolationListItem]]:
    return ApiResponse(data=await ViolationService(session).recent(limit))


@dashboard.get(
    "/recent-alerts",
    summary="Latest alerts of the current user",
    response_model=ApiResponse[list[NotificationOut]],
    responses=AUTH_ERRORS,
)
async def recent_alerts(
    user: CurrentUserDep, session: DbSession, limit: Annotated[int, Query(ge=1, le=20)] = 5
) -> ApiResponse[list[NotificationOut]]:
    items, _ = await NotificationService(session, user.id).search(None, None, 1, limit)
    return ApiResponse(data=items)


# ------------------------------------------------------------------ analytics


@analytics.get("/overview", summary="Headline numbers for a period",
               response_model=ApiResponse[AnalyticsOverview], responses=AUTH_ERRORS)  # fmt: skip
async def overview(
    _: AnalyticsViewer, session: DbSession, tz: TzDep, period: PeriodDep
) -> ApiResponse[AnalyticsOverview]:
    return ApiResponse(data=await InsightsService(session, tz).overview(period.start, period.end))


@analytics.get("/violations/by-day", summary="Daily series per type",
               response_model=ApiResponse[Timeseries], responses=AUTH_ERRORS)  # fmt: skip
async def by_day(
    _: AnalyticsViewer,
    session: DbSession,
    tz: TzDep,
    range: TimeRange = TimeRange.D30,  # noqa: A002
) -> ApiResponse[Timeseries]:
    return ApiResponse(
        data=await InsightsService(session, tz).violations_timeseries(range, datetime.now(UTC))
    )


@analytics.get("/violations/by-hour", summary="24-hour histogram",
               response_model=ApiResponse[list[HourBucket]], responses=AUTH_ERRORS)  # fmt: skip
async def by_hour(
    _: AnalyticsViewer, session: DbSession, tz: TzDep, period: PeriodDep
) -> ApiResponse[list[HourBucket]]:
    return ApiResponse(data=await InsightsService(session, tz).by_hour(period.start, period.end))


@analytics.get("/violations/by-weekday-hour", summary="7x24 heat grid (ISO weekday 1=Mon)",
               response_model=ApiResponse[list[HeatCell]], responses=AUTH_ERRORS)  # fmt: skip
async def by_weekday_hour(
    _: AnalyticsViewer, session: DbSession, tz: TzDep, period: PeriodDep
) -> ApiResponse[list[HeatCell]]:
    return ApiResponse(
        data=await InsightsService(session, tz).by_weekday_hour(period.start, period.end)
    )


@analytics.get("/violations/by-type", summary="Distribution by type",
               response_model=ApiResponse[Distribution], responses=AUTH_ERRORS)  # fmt: skip
async def by_type(
    _: AnalyticsViewer, session: DbSession, tz: TzDep, period: PeriodDep
) -> ApiResponse[Distribution]:
    return ApiResponse(
        data=await InsightsService(session, tz).violation_type_distribution(
            period.start, period.end, "custom"
        )
    )


@analytics.get("/violations/by-district", summary="Distribution by district",
               response_model=ApiResponse[Distribution], responses=AUTH_ERRORS)  # fmt: skip
async def by_district(
    _: AnalyticsViewer, session: DbSession, tz: TzDep, period: PeriodDep
) -> ApiResponse[Distribution]:
    return ApiResponse(
        data=await InsightsService(session, tz).by_district(period.start, period.end)
    )


@analytics.get("/violations/review-outcomes", summary="Confirmed vs rejected, reasons, accuracy",
               response_model=ApiResponse[ReviewOutcomes], responses=AUTH_ERRORS)  # fmt: skip
async def review_outcomes(
    _: AnalyticsViewer, session: DbSession, tz: TzDep, period: PeriodDep
) -> ApiResponse[ReviewOutcomes]:
    return ApiResponse(
        data=await InsightsService(session, tz).review_outcomes(period.start, period.end)
    )


@analytics.get("/vehicles/by-type", summary="Vehicle type distribution",
               response_model=ApiResponse[Distribution], responses=AUTH_ERRORS)  # fmt: skip
async def vehicles_by_type(
    _: AnalyticsViewer, session: DbSession, tz: TzDep, period: PeriodDep
) -> ApiResponse[Distribution]:
    return ApiResponse(
        data=await InsightsService(session, tz).vehicle_type_distribution(
            period.start, period.end, "custom"
        )
    )


@analytics.get(
    "/cameras/performance",
    summary="Per-camera uptime, fps, latency and review outcomes",
    response_model=ApiResponse[list[CameraPerformance]],
    responses=AUTH_ERRORS,
)
async def cameras_performance(
    _: AnalyticsViewer, session: DbSession, tz: TzDep, period: PeriodDep
) -> ApiResponse[list[CameraPerformance]]:
    return ApiResponse(
        data=await InsightsService(session, tz).camera_performance(period.start, period.end)
    )


@analytics.get("/top/cameras", summary="Cameras with most violations",
               response_model=ApiResponse[list[RankedItem]], responses=AUTH_ERRORS)  # fmt: skip
async def top_cameras(
    _: AnalyticsViewer, session: DbSession, tz: TzDep, period: PeriodDep, limit: TopLimit = 10
) -> ApiResponse[list[RankedItem]]:
    return ApiResponse(
        data=await InsightsService(session, tz).top_cameras(period.start, period.end, limit)
    )


@analytics.get("/top/locations", summary="Locations with most violations",
               response_model=ApiResponse[list[RankedItem]], responses=AUTH_ERRORS)  # fmt: skip
async def top_locations(
    _: AnalyticsViewer, session: DbSession, tz: TzDep, period: PeriodDep, limit: TopLimit = 10
) -> ApiResponse[list[RankedItem]]:
    return ApiResponse(
        data=await InsightsService(session, tz).top_locations(period.start, period.end, limit)
    )


@analytics.get("/top/vehicles", summary="Repeat offenders",
               response_model=ApiResponse[list[RankedItem]], responses=AUTH_ERRORS)  # fmt: skip
async def top_vehicles(
    _: AnalyticsViewer, session: DbSession, tz: TzDep, period: PeriodDep, limit: TopLimit = 10
) -> ApiResponse[list[RankedItem]]:
    return ApiResponse(
        data=await InsightsService(session, tz).top_vehicles(period.start, period.end, limit)
    )


# ------------------------------------------------------------------------ map


@map_router.get("/cameras", summary="Camera markers",
                response_model=ApiResponse[list[MapCamera]], responses=AUTH_ERRORS)  # fmt: skip
async def map_cameras(
    _: MonitoringViewer, session: DbSession, tz: TzDep
) -> ApiResponse[list[MapCamera]]:
    return ApiResponse(data=await InsightsService(session, tz).map_cameras(datetime.now(UTC)))


@map_router.get("/heatmap", summary="Violation weights per location",
                response_model=ApiResponse[list[HeatPoint]], responses=AUTH_ERRORS)  # fmt: skip
async def heatmap(
    _: ViolationViewer, session: DbSession, tz: TzDep, period: PeriodDep
) -> ApiResponse[list[HeatPoint]]:
    return ApiResponse(data=await InsightsService(session, tz).heatmap(period.start, period.end))


@map_router.get("/districts", summary="Districts with violation and camera counts",
                response_model=ApiResponse[list[MapDistrict]], responses=AUTH_ERRORS)  # fmt: skip
async def districts(
    _: CurrentUserDep, session: DbSession, tz: TzDep, period: PeriodDep
) -> ApiResponse[list[MapDistrict]]:
    return ApiResponse(data=await InsightsService(session, tz).districts(period.start, period.end))
