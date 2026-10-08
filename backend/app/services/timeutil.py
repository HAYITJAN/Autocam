from dataclasses import dataclass
from datetime import UTC, datetime, timedelta, tzinfo
from functools import cache
from zoneinfo import ZoneInfo

from app.schemas.insights import TimeRange


@cache
def display_tz(name: str) -> tzinfo:
    return ZoneInfo(name)


def local_day_start(now: datetime, tz: tzinfo, days_back: int = 0) -> datetime:
    local = now.astimezone(tz)
    start = local.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=days_back)
    return start.astimezone(UTC)


@dataclass(frozen=True, slots=True)
class Window:
    start: datetime
    end: datetime
    bucket: str  # "hour" | "day"
    buckets: list[datetime]  # local wall-clock bucket starts (naive)

    def local_buckets(self, tz: tzinfo) -> list[datetime]:
        return [b.replace(tzinfo=tz) for b in self.buckets]


def window_for(range_: TimeRange, now: datetime, tz: tzinfo) -> Window:
    local_now = now.astimezone(tz)
    if range_ is TimeRange.H24:
        last = local_now.replace(minute=0, second=0, microsecond=0)
        buckets = [last - timedelta(hours=h) for h in range(23, -1, -1)]
        return Window(
            start=buckets[0].astimezone(UTC),
            end=now,
            bucket="hour",
            buckets=[b.replace(tzinfo=None) for b in buckets],
        )
    days = 7 if range_ is TimeRange.D7 else 30
    today = local_now.replace(hour=0, minute=0, second=0, microsecond=0)
    buckets = [today - timedelta(days=d) for d in range(days - 1, -1, -1)]
    return Window(
        start=buckets[0].astimezone(UTC),
        end=now,
        bucket="day",
        buckets=[b.replace(tzinfo=None) for b in buckets],
    )


def pct_change(current: float, previous: float) -> float | None:
    if previous == 0:
        return None
    return round((current - previous) / previous * 100, 1)


def pct(part: float, total: float) -> float:
    return round(part / total * 100, 1) if total else 0.0
