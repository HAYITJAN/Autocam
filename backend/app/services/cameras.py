from dataclasses import dataclass
from datetime import datetime, timedelta, tzinfo
from enum import StrEnum
from typing import Any

from sqlalchemy import and_, func, select
from sqlalchemy.dialects.postgresql import distinct_on
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError
from app.models import (
    Camera,
    CameraConnection,
    CameraHealthLog,
    District,
    Location,
    TrafficLight,
    TrafficZone,
    Violation,
    ViolationType,
)
from app.models.enums import CameraStatus, CameraType, ConnectionType
from app.schemas.common import PageMeta
from app.schemas.domain import (
    CameraConnectionOut,
    CameraDetail,
    CameraListItem,
    CameraMetrics,
    CameraStatistics,
    CameraSummary,
    SeriesPoint,
    TrafficZoneOut,
    TypeCount,
)
from app.schemas.insights import TimeRange
from app.services.common import AnySelect, location_ref, paginate
from app.services.timeutil import local_day_start, pct, window_for

METRICS_MAX_AGE = timedelta(hours=2)


class CameraSort(StrEnum):
    CODE = "code"
    NAME = "name"
    STATUS = "status"
    HEARTBEAT = "-last_heartbeat_at"
    VIOLATIONS = "-violations_today"


@dataclass(slots=True)
class CameraFilters:
    search: str | None = None
    status: CameraStatus | None = None
    district_id: int | None = None
    location_id: int | None = None
    camera_type: CameraType | None = None
    connection_type: ConnectionType | None = None
    ai_enabled: bool | None = None


def _latest_metrics(now: datetime) -> Any:
    return (
        select(
            CameraHealthLog.camera_id,
            CameraHealthLog.fps,
            CameraHealthLog.latency_ms,
            CameraHealthLog.cpu_percent,
            CameraHealthLog.temperature_c,
            CameraHealthLog.packet_loss_pct,
            CameraHealthLog.recorded_at,
        )
        .where(CameraHealthLog.recorded_at >= now - METRICS_MAX_AGE)
        .ext(distinct_on(CameraHealthLog.camera_id))
        .order_by(CameraHealthLog.camera_id, CameraHealthLog.recorded_at.desc())
        .subquery("latest_metrics")
    )


def _violations_since(start: datetime) -> Any:
    return (
        select(Violation.camera_id, func.count().label("n"))
        .where(Violation.occurred_at >= start)
        .group_by(Violation.camera_id)
        .subquery("violations_today")
    )


class CameraService:
    def __init__(self, session: AsyncSession, tz: tzinfo) -> None:
        self.session = session
        self.tz = tz

    def _base(self, now: datetime) -> tuple[AnySelect, Any, Any]:
        metrics = _latest_metrics(now)
        today = _violations_since(local_day_start(now, self.tz))
        stmt = (
            select(Camera, Location, District, CameraConnection, metrics, today.c.n)
            .join(Location, Camera.location_id == Location.id)
            .join(District, Location.district_id == District.id)
            .outerjoin(
                CameraConnection,
                and_(CameraConnection.camera_id == Camera.id, CameraConnection.is_primary),
            )
            .outerjoin(metrics, metrics.c.camera_id == Camera.id)
            .outerjoin(today, today.c.camera_id == Camera.id)
            .where(Camera.deleted_at.is_(None))
        )
        return stmt, metrics, today

    @staticmethod
    def _item(row: Any) -> CameraListItem:
        camera, location, district, connection = row[0], row[1], row[2], row[3]
        mapping = row._mapping
        loc = location_ref(location, district)
        if loc is None:
            raise RuntimeError(f"Camera {camera.id} has no location")
        return CameraListItem(
            id=camera.id,
            code=camera.code,
            name=camera.name,
            status=camera.status,
            camera_type=camera.camera_type,
            is_enabled=camera.is_enabled,
            ai_enabled=camera.ai_enabled,
            location=loc,
            connection_type=connection.connection_type if connection else None,
            signal_strength_dbm=connection.signal_strength_dbm if connection else None,
            last_heartbeat_at=camera.last_heartbeat_at,
            metrics=CameraMetrics(
                fps=mapping["fps"],
                latency_ms=mapping["latency_ms"],
                cpu_percent=mapping["cpu_percent"],
                temperature_c=mapping["temperature_c"],
                packet_loss_pct=mapping["packet_loss_pct"],
                recorded_at=mapping["recorded_at"],
            ),
            violations_today=int(mapping["n"] or 0),
        )

    async def search(
        self, filters: CameraFilters, page: int, page_size: int, sort: CameraSort, now: datetime
    ) -> tuple[list[CameraListItem], PageMeta]:
        stmt, _, today = self._base(now)
        if filters.search:
            term = f"%{filters.search.strip()}%"
            stmt = stmt.where(
                Camera.code.ilike(term) | Camera.name.ilike(term) | Location.name.ilike(term)
            )
        if filters.status:
            stmt = stmt.where(Camera.status == filters.status)
        if filters.district_id:
            stmt = stmt.where(Location.district_id == filters.district_id)
        if filters.location_id:
            stmt = stmt.where(Camera.location_id == filters.location_id)
        if filters.camera_type:
            stmt = stmt.where(Camera.camera_type == filters.camera_type)
        if filters.connection_type:
            stmt = stmt.where(CameraConnection.connection_type == filters.connection_type)
        if filters.ai_enabled is not None:
            stmt = stmt.where(Camera.ai_enabled.is_(filters.ai_enabled))
        order: Any = {
            CameraSort.CODE: Camera.code.asc(),
            CameraSort.NAME: Camera.name.asc(),
            CameraSort.STATUS: Camera.status.asc(),
            CameraSort.HEARTBEAT: Camera.last_heartbeat_at.desc().nulls_last(),
            CameraSort.VIOLATIONS: func.coalesce(today.c.n, 0).desc(),
        }[sort]
        rows, meta = await paginate(self.session, stmt.order_by(order, Camera.id), page, page_size)
        return [self._item(row) for row in rows], meta

    async def summary(self) -> CameraSummary:
        counts = dict(
            (
                await self.session.execute(
                    select(Camera.status, func.count())
                    .where(Camera.deleted_at.is_(None))
                    .group_by(Camera.status)
                )
            ).all()
        )
        return CameraSummary(
            total=sum(counts.values()),
            online=counts.get(CameraStatus.ONLINE, 0),
            offline=counts.get(CameraStatus.OFFLINE, 0),
            warning=counts.get(CameraStatus.WARNING, 0),
            maintenance=counts.get(CameraStatus.MAINTENANCE, 0),
        )

    async def detail(self, camera_id: int, now: datetime) -> CameraDetail:
        stmt, _, _ = self._base(now)
        row = (await self.session.execute(stmt.where(Camera.id == camera_id))).first()
        if row is None:
            raise NotFoundError("Camera")
        camera: Camera = row[0]
        connections = await self.session.scalars(
            select(CameraConnection)
            .where(CameraConnection.camera_id == camera_id)
            .order_by(CameraConnection.is_primary.desc(), CameraConnection.id)
        )
        zones = await self.session.scalars(
            select(TrafficZone).where(TrafficZone.camera_id == camera_id).order_by(TrafficZone.id)
        )
        has_light = await self.session.scalar(
            select(func.count()).where(TrafficLight.camera_id == camera_id)
        )
        return CameraDetail(
            **self._item(row).model_dump(),
            ip_address=str(camera.ip_address) if camera.ip_address else None,
            port=camera.port,
            mac_address=camera.mac_address,
            rtsp_configured=bool(camera.rtsp_url),
            resolution=camera.resolution,
            fps_target=camera.fps_target,
            recording_enabled=camera.recording_enabled,
            retention_days=camera.retention_days,
            confidence_threshold=camera.confidence_threshold,
            speed_limit_kmh=camera.speed_limit_kmh,
            road_direction_deg=camera.road_direction_deg,
            installed_at=camera.installed_at,
            connections=[
                CameraConnectionOut(
                    id=c.id,
                    connection_type=c.connection_type,
                    is_primary=c.is_primary,
                    status=c.status,
                    operator=c.operator,
                    ssid_or_apn=c.ssid_or_apn,
                    ip_address=str(c.ip_address) if c.ip_address else None,
                    signal_strength_dbm=c.signal_strength_dbm,
                    bandwidth_mbps=c.bandwidth_mbps,
                )
                for c in connections
            ],
            zones=[TrafficZoneOut.model_validate(z) for z in zones],
            has_traffic_light=bool(has_light),
        )

    async def statistics(
        self, camera_id: int, range_: TimeRange, now: datetime
    ) -> CameraStatistics:
        if await self.session.get(Camera, camera_id) is None:
            raise NotFoundError("Camera")
        window = window_for(range_, now, self.tz)
        tz_name = str(self.tz)
        v_bucket = func.date_trunc(window.bucket, func.timezone(tz_name, Violation.occurred_at))
        violations: dict[datetime, int] = dict(
            (
                await self.session.execute(
                    select(v_bucket, func.count())
                    .where(Violation.camera_id == camera_id, Violation.occurred_at >= window.start)
                    .group_by(v_bucket)
                )
            ).all()
        )
        h_bucket = func.date_trunc(
            window.bucket, func.timezone(tz_name, CameraHealthLog.recorded_at)
        )
        health = {
            bucket: (fps, latency)
            for bucket, fps, latency in (
                await self.session.execute(
                    select(
                        h_bucket,
                        func.avg(CameraHealthLog.fps),
                        func.avg(CameraHealthLog.latency_ms),
                    )
                    .where(
                        CameraHealthLog.camera_id == camera_id,
                        CameraHealthLog.recorded_at >= window.start,
                    )
                    .group_by(h_bucket)
                )
            ).all()
        }
        online, samples = (
            await self.session.execute(
                select(
                    func.count().filter(CameraHealthLog.status == CameraStatus.ONLINE),
                    func.count(),
                ).where(
                    CameraHealthLog.camera_id == camera_id,
                    CameraHealthLog.recorded_at >= window.start,
                )
            )
        ).one()
        by_type_rows = (
            await self.session.execute(
                select(ViolationType.code, ViolationType.name_uz, ViolationType.color, func.count())
                .join(Violation, Violation.violation_type_id == ViolationType.id)
                .where(Violation.camera_id == camera_id, Violation.occurred_at >= window.start)
                .group_by(ViolationType.code, ViolationType.name_uz, ViolationType.color)
                .order_by(func.count().desc())
            )
        ).all()
        total = sum(int(n) for *_, n in by_type_rows)
        points = window.local_buckets(self.tz)

        def _num(value: Any) -> float | None:
            return round(float(value), 2) if value is not None else None

        return CameraStatistics(
            range=range_.value,
            violations_total=total,
            violations_series=[
                SeriesPoint(t=p, value=float(violations.get(b, 0)))
                for p, b in zip(points, window.buckets, strict=True)
            ],
            fps_series=[
                SeriesPoint(t=p, value=_num(health.get(b, (None, None))[0]))
                for p, b in zip(points, window.buckets, strict=True)
            ],
            latency_series=[
                SeriesPoint(t=p, value=_num(health.get(b, (None, None))[1]))
                for p, b in zip(points, window.buckets, strict=True)
            ],
            uptime_pct=pct(online, samples) if samples else None,
            by_type=[
                TypeCount(code=code, name=name, color=color, count=n, pct=pct(n, total))
                for code, name, color, n in by_type_rows
            ],
        )
