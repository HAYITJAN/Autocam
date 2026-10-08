from dataclasses import dataclass, replace
from datetime import UTC, datetime, timedelta, tzinfo
from typing import Annotated

from fastapi import Depends, Query

from app.api.deps import SettingsDep
from app.core.errors import AppError, ErrorCode
from app.models.enums import ViolationStatus
from app.services.timeutil import display_tz
from app.services.violations import ViolationFilters

MAX_PERIOD_DAYS = 366
DEFAULT_PERIOD_DAYS = 30

Page = Annotated[int, Query(ge=1, description="1-based page number")]
PageSize = Annotated[int, Query(ge=1, le=100, description="Items per page (max 100)")]


def get_tz(settings: SettingsDep) -> tzinfo:
    return display_tz(settings.display_timezone)


TzDep = Annotated[tzinfo, Depends(get_tz)]


@dataclass(frozen=True, slots=True)
class Period:
    start: datetime
    end: datetime


def get_period(
    date_from: Annotated[
        datetime | None, Query(description="ISO 8601, default: 30 days ago")
    ] = None,
    date_to: Annotated[datetime | None, Query(description="ISO 8601, default: now")] = None,
) -> Period:
    end = _aware(date_to) if date_to else datetime.now(UTC)
    start = _aware(date_from) if date_from else end - timedelta(days=DEFAULT_PERIOD_DAYS)
    if start >= end:
        raise AppError(
            "date_from must be before date_to", code=ErrorCode.VALIDATION_ERROR, status_code=422
        )
    if end - start > timedelta(days=MAX_PERIOD_DAYS):
        raise AppError(
            f"Period must not exceed {MAX_PERIOD_DAYS} days",
            code=ErrorCode.VALIDATION_ERROR,
            status_code=422,
        )
    return Period(start, end)


PeriodDep = Annotated[Period, Depends(get_period)]


def get_violation_filters(
    date_from: Annotated[datetime | None, Query(description="ISO 8601, inclusive")] = None,
    date_to: Annotated[datetime | None, Query(description="ISO 8601, inclusive")] = None,
    status: Annotated[list[ViolationStatus] | None, Query()] = None,
    violation_type: Annotated[
        list[str] | None, Query(description="Violation type codes, e.g. RED_LIGHT")
    ] = None,
    camera_id: int | None = None,
    camera_code: Annotated[str | None, Query(max_length=20)] = None,
    location_id: int | None = None,
    district_id: int | None = None,
    direction: Annotated[list[str] | None, Query(description="NORTH, SOUTH, EAST, WEST")] = None,
    vehicle_type: str | None = None,
    vehicle_id: int | None = None,
    vehicle_model: Annotated[
        str | None, Query(max_length=60, description="Brand and/or model, partial match")
    ] = None,
    plate: Annotated[str | None, Query(max_length=20)] = None,
    search: Annotated[
        str | None,
        Query(max_length=50, description="Event code, plate, camera code or violation type"),
    ] = None,
    confidence_min: Annotated[float | None, Query(ge=0, le=1)] = None,
    confidence_max: Annotated[float | None, Query(ge=0, le=1)] = None,
    assigned_to: int | None = None,
) -> ViolationFilters:
    return ViolationFilters(
        date_from=_aware(date_from) if date_from else None,
        date_to=_aware(date_to) if date_to else None,
        status=status,
        violation_type=violation_type,
        camera_id=camera_id,
        camera_code=camera_code,
        location_id=location_id,
        district_id=district_id,
        direction=direction,
        vehicle_type=vehicle_type,
        vehicle_id=vehicle_id,
        vehicle_model=vehicle_model,
        plate=plate,
        search=search,
        confidence_min=confidence_min,
        confidence_max=confidence_max,
        assigned_to=assigned_to,
    )


ViolationFiltersDep = Annotated[ViolationFilters, Depends(get_violation_filters)]


def get_bounded_violation_filters(filters: ViolationFiltersDep) -> ViolationFilters:
    """Same filters with a mandatory period (default: last 30 days) for aggregations."""
    period = get_period(filters.date_from, filters.date_to)
    return replace(filters, date_from=period.start, date_to=period.end)


BoundedViolationFiltersDep = Annotated[ViolationFilters, Depends(get_bounded_violation_filters)]


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=UTC)
