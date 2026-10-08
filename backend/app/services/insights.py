"""Read-only aggregations for the dashboard, analytics and map pages."""

from datetime import datetime, timedelta, tzinfo
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Camera,
    CameraHealthLog,
    District,
    Location,
    Vehicle,
    VehicleType,
    Violation,
    ViolationType,
)
from app.models.enums import CameraStatus, ViolationStatus
from app.schemas.domain import TypeCount
from app.schemas.insights import (
    AnalyticsOverview,
    CameraPerformance,
    DashboardKpis,
    Distribution,
    HeatCell,
    HeatPoint,
    HourBucket,
    Kpi,
    MapCamera,
    MapDistrict,
    NamedSeries,
    RankedItem,
    ReviewOutcomeDay,
    ReviewOutcomes,
    TimeRange,
    Timeseries,
)
from app.services.timeutil import local_day_start, pct, pct_change, window_for

PENDING = (ViolationStatus.NEW, ViolationStatus.UNDER_REVIEW)
SPARK_DAYS = 7


class InsightsService:
    def __init__(self, session: AsyncSession, tz: tzinfo) -> None:
        self.session = session
        self.tz = tz
        self.tz_name = str(tz)

    def _local_day(self, column: Any) -> Any:
        return func.date_trunc("day", func.timezone(self.tz_name, column))

    # ----------------------------------------------------------------- dashboard

    async def kpis(self, now: datetime) -> DashboardKpis:
        today = local_day_start(now, self.tz)
        yesterday = local_day_start(now, self.tz, 1)
        week_ago = now - timedelta(days=7)

        total_vehicles, new_week, new_prev_week = (
            await self.session.execute(
                select(
                    func.count(),
                    func.count().filter(Vehicle.first_seen_at >= week_ago),
                    func.count().filter(
                        Vehicle.first_seen_at >= week_ago - timedelta(days=7),
                        Vehicle.first_seen_at < week_ago,
                    ),
                ).select_from(Vehicle)
            )
        ).one()
        cameras_total, cameras_online = (
            await self.session.execute(
                select(
                    func.count(), func.count().filter(Camera.status == CameraStatus.ONLINE)
                ).where(Camera.deleted_at.is_(None))
            )
        ).one()
        today_n, confirmed, pending, same_time_yday = (
            await self.session.execute(
                select(
                    func.count().filter(Violation.occurred_at >= today),
                    func.count().filter(
                        Violation.occurred_at >= today,
                        Violation.status.in_((ViolationStatus.CONFIRMED, ViolationStatus.ARCHIVED)),
                    ),
                    func.count().filter(
                        Violation.occurred_at >= today, Violation.status.in_(PENDING)
                    ),
                    func.count().filter(
                        Violation.occurred_at >= yesterday,
                        Violation.occurred_at < now - timedelta(days=1),
                    ),
                ).where(Violation.occurred_at >= yesterday)
            )
        ).one()
        online_samples, samples = (
            await self.session.execute(
                select(
                    func.count().filter(CameraHealthLog.status == CameraStatus.ONLINE), func.count()
                ).where(CameraHealthLog.recorded_at >= now - timedelta(days=30))
            )
        ).one()

        violations_daily = await self._daily_counts(Violation.occurred_at, now)
        confirmed_daily = await self._daily_counts(
            Violation.occurred_at, now, Violation.status == ViolationStatus.CONFIRMED
        )
        pending_daily = await self._daily_counts(
            Violation.occurred_at, now, Violation.status.in_(PENDING)
        )
        new_vehicles_daily = await self._daily_counts(Vehicle.first_seen_at, now)
        uptime_daily = await self._daily_uptime(now)

        return DashboardKpis(
            total_vehicles=Kpi(
                value=total_vehicles,
                delta_pct=pct_change(new_week, new_prev_week),
                sparkline=_cumulative(total_vehicles, new_vehicles_daily),
            ),
            active_cameras=Kpi(
                value=cameras_online,
                secondary=pct(cameras_online, cameras_total),
            ),
            total_cameras=cameras_total,
            violations_today=Kpi(
                value=today_n,
                delta_pct=pct_change(today_n, same_time_yday),
                sparkline=violations_daily,
            ),
            confirmed_today=Kpi(
                value=confirmed, secondary=pct(confirmed, today_n), sparkline=confirmed_daily
            ),
            pending_today=Kpi(
                value=pending, secondary=pct(pending, today_n), sparkline=pending_daily
            ),
            uptime_pct=Kpi(
                value=pct(online_samples, samples) if samples else 0.0, sparkline=uptime_daily
            ),
            generated_at=now,
        )

    async def _daily_counts(self, column: Any, now: datetime, *conditions: Any) -> list[float]:
        start = local_day_start(now, self.tz, SPARK_DAYS - 1)
        bucket = self._local_day(column)
        stmt = select(bucket, func.count()).where(column >= start, *conditions).group_by(bucket)
        rows: dict[datetime, int] = dict((await self.session.execute(stmt)).all())
        first = start.astimezone(self.tz).replace(tzinfo=None)
        return [float(rows.get(first + timedelta(days=d), 0)) for d in range(SPARK_DAYS)]

    async def _daily_uptime(self, now: datetime) -> list[float]:
        start = local_day_start(now, self.tz, SPARK_DAYS - 1)
        bucket = self._local_day(CameraHealthLog.recorded_at)
        stmt = (
            select(
                bucket,
                func.count().filter(CameraHealthLog.status == CameraStatus.ONLINE),
                func.count(),
            )
            .where(CameraHealthLog.recorded_at >= start)
            .group_by(bucket)
        )
        rows = {b: pct(o, t) for b, o, t in (await self.session.execute(stmt)).all()}
        first = start.astimezone(self.tz).replace(tzinfo=None)
        return [rows.get(first + timedelta(days=d), 0.0) for d in range(SPARK_DAYS)]

    async def violations_timeseries(self, range_: TimeRange, now: datetime) -> Timeseries:
        window = window_for(range_, now, self.tz)
        bucket = func.date_trunc(window.bucket, func.timezone(self.tz_name, Violation.occurred_at))
        rows = (
            await self.session.execute(
                select(ViolationType.code, bucket, func.count())
                .join(ViolationType, Violation.violation_type_id == ViolationType.id)
                .where(Violation.occurred_at >= window.start)
                .group_by(ViolationType.code, bucket)
            )
        ).all()
        counts: dict[tuple[str, datetime], int] = {(c, b): n for c, b, n in rows}
        types = (
            await self.session.execute(
                select(ViolationType.code, ViolationType.name_uz, ViolationType.color)
                .where(ViolationType.is_active.is_(True))
                .order_by(ViolationType.id)
            )
        ).all()
        series = [
            NamedSeries(
                code=code,
                name=name,
                color=color,
                values=[counts.get((code, b), 0) for b in window.buckets],
            )
            for code, name, color in types
        ]
        return Timeseries(
            range=range_.value,
            bucket=window.bucket,
            buckets=window.local_buckets(self.tz),
            series=series,
            totals=[sum(s.values[i] for s in series) for i in range(len(window.buckets))],
        )

    async def violation_type_distribution(
        self, start: datetime, end: datetime, label: str
    ) -> Distribution:
        rows = (
            await self.session.execute(
                select(ViolationType.code, ViolationType.name_uz, ViolationType.color, func.count())
                .join(Violation, Violation.violation_type_id == ViolationType.id)
                .where(Violation.occurred_at >= start, Violation.occurred_at <= end)
                .group_by(ViolationType.code, ViolationType.name_uz, ViolationType.color)
                .order_by(func.count().desc())
            )
        ).all()
        return _distribution(label, rows)

    async def vehicle_type_distribution(
        self, start: datetime, end: datetime, label: str
    ) -> Distribution:
        rows = (
            await self.session.execute(
                select(VehicleType.code, VehicleType.name_uz, VehicleType.color, func.count())
                .join(Vehicle, Vehicle.vehicle_type_id == VehicleType.id)
                .where(Vehicle.last_seen_at >= start, Vehicle.last_seen_at <= end)
                .group_by(VehicleType.code, VehicleType.name_uz, VehicleType.color)
                .order_by(func.count().desc())
            )
        ).all()
        return _distribution(label, rows)

    # ----------------------------------------------------------------- analytics

    async def overview(self, start: datetime, end: datetime) -> AnalyticsOverview:
        span = end - start
        row = (
            await self.session.execute(
                select(
                    func.count(),
                    func.count().filter(Violation.status == ViolationStatus.CONFIRMED),
                    func.count().filter(Violation.status == ViolationStatus.REJECTED),
                    func.count().filter(Violation.status.in_(PENDING)),
                    func.count().filter(Violation.status == ViolationStatus.ARCHIVED),
                    func.count(func.distinct(Violation.vehicle_id)),
                ).where(Violation.occurred_at >= start, Violation.occurred_at <= end)
            )
        ).one()
        total, confirmed, rejected, pending, archived, vehicles = row
        previous = await self.session.scalar(
            select(func.count()).where(
                Violation.occurred_at >= start - span, Violation.occurred_at < start
            )
        )
        types = await self.violation_type_distribution(start, end, "custom")
        days = max(span.total_seconds() / 86400, 1)
        decided = confirmed + rejected
        return AnalyticsOverview(
            date_from=start,
            date_to=end,
            total=total,
            confirmed=confirmed,
            rejected=rejected,
            pending=pending,
            archived=archived,
            avg_per_day=round(total / days, 1),
            accuracy_pct=pct(confirmed, decided) if decided else None,
            total_delta_pct=pct_change(total, previous or 0),
            vehicles_involved=vehicles,
            top_type=types.items[0] if types.items else None,
        )

    async def by_hour(self, start: datetime, end: datetime) -> list[HourBucket]:
        hour = func.extract("hour", func.timezone(self.tz_name, Violation.occurred_at))
        rows = dict(
            (
                await self.session.execute(
                    select(hour, func.count())
                    .where(Violation.occurred_at >= start, Violation.occurred_at <= end)
                    .group_by(hour)
                )
            ).all()
        )
        return [HourBucket(hour=h, count=int(rows.get(h, 0))) for h in range(24)]

    async def by_weekday_hour(self, start: datetime, end: datetime) -> list[HeatCell]:
        local = func.timezone(self.tz_name, Violation.occurred_at)
        dow = func.extract("isodow", local)
        hour = func.extract("hour", local)
        rows = {
            (int(d), int(h)): n
            for d, h, n in (
                await self.session.execute(
                    select(dow, hour, func.count())
                    .where(Violation.occurred_at >= start, Violation.occurred_at <= end)
                    .group_by(dow, hour)
                )
            ).all()
        }
        return [
            HeatCell(weekday=d, hour=h, count=rows.get((d, h), 0))
            for d in range(1, 8)
            for h in range(24)
        ]

    async def by_district(self, start: datetime, end: datetime) -> Distribution:
        rows = (
            await self.session.execute(
                select(District.code, District.name, func.count(Violation.id))
                .select_from(District)
                .join(Location, Location.district_id == District.id)
                .join(Violation, Violation.location_id == Location.id)
                .where(Violation.occurred_at >= start, Violation.occurred_at <= end)
                .group_by(District.code, District.name)
                .order_by(func.count(Violation.id).desc())
            )
        ).all()
        return _distribution("custom", [(c, n, None, k) for c, n, k in rows])

    async def top_cameras(self, start: datetime, end: datetime, limit: int) -> list[RankedItem]:
        rows = (
            await self.session.execute(
                select(Camera.id, Camera.code, Camera.name, func.count(Violation.id))
                .join(Violation, Violation.camera_id == Camera.id)
                .where(Violation.occurred_at >= start, Violation.occurred_at <= end)
                .group_by(Camera.id)
                .order_by(func.count(Violation.id).desc())
                .limit(limit)
            )
        ).all()
        return [RankedItem(id=i, label=c, sublabel=n, count=k) for i, c, n, k in rows]

    async def top_locations(self, start: datetime, end: datetime, limit: int) -> list[RankedItem]:
        rows = (
            await self.session.execute(
                select(Location.id, Location.name, District.name, func.count(Violation.id))
                .join(District, Location.district_id == District.id)
                .join(Violation, Violation.location_id == Location.id)
                .where(Violation.occurred_at >= start, Violation.occurred_at <= end)
                .group_by(Location.id, District.name)
                .order_by(func.count(Violation.id).desc())
                .limit(limit)
            )
        ).all()
        return [RankedItem(id=i, label=n, sublabel=d, count=k) for i, n, d, k in rows]

    async def top_vehicles(self, start: datetime, end: datetime, limit: int) -> list[RankedItem]:
        rows = (
            await self.session.execute(
                select(
                    Vehicle.id, Vehicle.plate_display, Vehicle.brand, Vehicle.model, func.count()
                )
                .join(Violation, Violation.vehicle_id == Vehicle.id)
                .where(Violation.occurred_at >= start, Violation.occurred_at <= end)
                .group_by(Vehicle.id)
                .order_by(func.count().desc())
                .limit(limit)
            )
        ).all()
        return [
            RankedItem(id=i, label=p, sublabel=" ".join(x for x in (b, m) if x) or None, count=k)
            for i, p, b, m, k in rows
        ]

    async def camera_performance(self, start: datetime, end: datetime) -> list[CameraPerformance]:
        health = (
            select(
                CameraHealthLog.camera_id,
                (
                    func.count().filter(CameraHealthLog.status == CameraStatus.ONLINE)
                    * 100.0
                    / func.nullif(func.count(), 0)
                ).label("uptime"),
                func.avg(CameraHealthLog.fps).label("fps"),
                func.avg(CameraHealthLog.latency_ms).label("latency"),
            )
            .where(CameraHealthLog.recorded_at >= start, CameraHealthLog.recorded_at <= end)
            .group_by(CameraHealthLog.camera_id)
            .subquery()
        )
        violations = (
            select(
                Violation.camera_id,
                func.count().label("total"),
                func.count().filter(Violation.status == ViolationStatus.CONFIRMED).label("ok"),
                func.count().filter(Violation.status == ViolationStatus.REJECTED).label("bad"),
            )
            .where(Violation.occurred_at >= start, Violation.occurred_at <= end)
            .group_by(Violation.camera_id)
            .subquery()
        )
        rows = (
            await self.session.execute(
                select(
                    Camera.id, Camera.code, Camera.name, Camera.status,
                    health.c.uptime, health.c.fps, health.c.latency,
                    violations.c.total, violations.c.ok, violations.c.bad,
                )
                .outerjoin(health, health.c.camera_id == Camera.id)
                .outerjoin(violations, violations.c.camera_id == Camera.id)
                .where(Camera.deleted_at.is_(None))
                .order_by(Camera.code)
            )
        ).all()  # fmt: skip
        return [
            CameraPerformance(
                id=i, code=code, name=name, status=status,
                uptime_pct=_round(uptime), avg_fps=_round(fps), avg_latency_ms=_round(latency),
                violations=int(total or 0), confirmed=int(ok or 0), rejected=int(bad or 0),
            )
            for i, code, name, status, uptime, fps, latency, total, ok, bad in rows
        ]  # fmt: skip

    async def review_outcomes(self, start: datetime, end: datetime) -> ReviewOutcomes:
        day = self._local_day(Violation.reviewed_at)
        days = (
            await self.session.execute(
                select(
                    day,
                    func.count().filter(Violation.status == ViolationStatus.CONFIRMED),
                    func.count().filter(Violation.status == ViolationStatus.REJECTED),
                )
                .where(Violation.reviewed_at >= start, Violation.reviewed_at <= end)
                .group_by(day)
                .order_by(day)
            )
        ).all()
        reasons = (
            await self.session.execute(
                select(Violation.rejection_reason, func.count())
                .where(
                    Violation.status == ViolationStatus.REJECTED,
                    Violation.rejection_reason.is_not(None),
                    Violation.occurred_at >= start,
                    Violation.occurred_at <= end,
                )
                .group_by(Violation.rejection_reason)
                .order_by(func.count().desc())
                .limit(10)
            )
        ).all()
        accuracy = (
            await self.session.execute(
                select(
                    ViolationType.code,
                    ViolationType.name_uz,
                    ViolationType.color,
                    func.count().filter(Violation.status == ViolationStatus.CONFIRMED),
                    func.count().filter(
                        Violation.status.in_((ViolationStatus.CONFIRMED, ViolationStatus.REJECTED))
                    ),
                )
                .join(Violation, Violation.violation_type_id == ViolationType.id)
                .where(Violation.occurred_at >= start, Violation.occurred_at <= end)
                .group_by(ViolationType.code, ViolationType.name_uz, ViolationType.color)
            )
        ).all()
        reason_total = sum(n for _, n in reasons)
        return ReviewOutcomes(
            days=[
                ReviewOutcomeDay(day=d.replace(tzinfo=self.tz), confirmed=c, rejected=r)
                for d, c, r in days
            ],
            rejection_reasons=[
                TypeCount(code=str(i), name=str(reason), count=n, pct=pct(n, reason_total))
                for i, (reason, n) in enumerate(reasons)
            ],
            accuracy_by_type=[
                TypeCount(code=c, name=n, color=col, count=ok, pct=pct(ok, decided))
                for c, n, col, ok, decided in accuracy
                if decided
            ],
        )

    # ----------------------------------------------------------------------- map

    async def map_cameras(self, now: datetime) -> list[MapCamera]:
        today = (
            select(Violation.camera_id, func.count().label("n"))
            .where(Violation.occurred_at >= local_day_start(now, self.tz))
            .group_by(Violation.camera_id)
            .subquery()
        )
        rows = (
            await self.session.execute(
                select(
                    Camera.id, Camera.code, Camera.name, Camera.status,
                    Location.latitude, Location.longitude, Location.name, District.name, today.c.n,
                )
                .join(Location, Camera.location_id == Location.id)
                .join(District, Location.district_id == District.id)
                .outerjoin(today, today.c.camera_id == Camera.id)
                .where(Camera.deleted_at.is_(None))
                .order_by(Camera.code)
            )
        ).all()  # fmt: skip
        # Cameras sharing a location get a small deterministic offset so markers do not overlap.
        seen: dict[tuple[float, float], int] = {}
        result = []
        for i, code, name, status, lat, lng, loc, district, n in rows:
            k = seen.get((lat, lng), 0)
            seen[(lat, lng)] = k + 1
            result.append(
                MapCamera(
                    id=i, code=code, name=name, status=status,
                    latitude=lat + 0.0006 * k, longitude=lng + 0.0006 * k,
                    location_name=loc, district_name=district, violations_today=int(n or 0),
                )
            )  # fmt: skip
        return result

    async def heatmap(self, start: datetime, end: datetime) -> list[HeatPoint]:
        rows = (
            await self.session.execute(
                select(
                    Location.latitude, Location.longitude, Location.name, func.count(Violation.id)
                )
                .join(Violation, Violation.location_id == Location.id)
                .where(Violation.occurred_at >= start, Violation.occurred_at <= end)
                .group_by(Location.id)
            )
        ).all()
        return [
            HeatPoint(latitude=lat, longitude=lng, location_name=name, weight=n)
            for lat, lng, name, n in rows
        ]

    async def districts(self, start: datetime, end: datetime) -> list[MapDistrict]:
        violations = (
            select(Location.district_id, func.count(Violation.id).label("n"))
            .join(Violation, Violation.location_id == Location.id)
            .where(Violation.occurred_at >= start, Violation.occurred_at <= end)
            .group_by(Location.district_id)
            .subquery()
        )
        cameras = (
            select(Location.district_id, func.count(Camera.id).label("n"))
            .join(Camera, Camera.location_id == Location.id)
            .where(Camera.deleted_at.is_(None))
            .group_by(Location.district_id)
            .subquery()
        )
        rows = (
            await self.session.execute(
                select(
                    District.id, District.code, District.name, District.center_lat,
                    District.center_lng, violations.c.n, cameras.c.n,
                )
                .outerjoin(violations, violations.c.district_id == District.id)
                .outerjoin(cameras, cameras.c.district_id == District.id)
                .order_by(District.name)
            )
        ).all()  # fmt: skip
        return [
            MapDistrict(
                id=i, code=c, name=n, center_lat=lat, center_lng=lng,
                violations=int(v or 0), cameras=int(k or 0),
            )
            for i, c, n, lat, lng, v, k in rows
        ]  # fmt: skip


def _round(value: Any) -> float | None:
    return round(float(value), 2) if value is not None else None


def _cumulative(total: int, new_per_day: list[float]) -> list[float]:
    values: list[float] = []
    running = float(total)
    for added in reversed(new_per_day):
        values.append(running)
        running -= added
    return list(reversed(values))


def _distribution(label: str, rows: Any) -> Distribution:
    total = sum(int(r[3]) for r in rows)
    return Distribution(
        range=label,
        total=total,
        items=[
            TypeCount(code=c, name=n, color=col, count=k, pct=pct(k, total))
            for c, n, col, k in rows
        ],
    )
