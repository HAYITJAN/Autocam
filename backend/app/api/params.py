from dataclasses import dataclass
from datetime import UTC, datetime, timedelta, tzinfo
from typing import Annotated

from fastapi import Depends, Query

from app.api.deps import SettingsDep
from app.core.errors import AppError, ErrorCode
from app.services.timeutil import display_tz

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


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=UTC)
