"""Statistics and groupings over violation events.

Counting rules (one place, used by every endpoint):
- total violations / violations by type  -> COUNT of events, never of vehicles;
- unique violators                         -> DISTINCT vehicles with >= 1 event;
- repeat violators                         -> DISTINCT vehicles with > 1 event;
- total vehicles                           -> traffic counters of the selected cameras;
- unique vehicles                          -> DISTINCT plates read by the selected cameras.
"""

from dataclasses import replace
from datetime import datetime, timedelta, tzinfo
from enum import StrEnum
from typing import Any

from sqlalchemy import distinct, extract, func, select
from sqlalchemy.dialects.postgresql import distinct_on
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.core.errors import NotFoundError
from app.models import (
    Camera,
    District,
    Location,
    TrafficStatsHourly,
    Vehicle,
    VehicleDetection,
    VehicleType,
    Violation,
    ViolationType,
)
from app.models.enums import ViolationStatus
from app.schemas.common import PageMeta
from app.schemas.domain import CameraRef, TypeCount, VehicleRef
from app.schemas.insights import NamedSeries, Timeseries
from app.schemas.violation_stats import (
    CameraStat,
    StatusCount,
    ViolationStatistics,
    ViolationTypeDetail,
    ViolationTypeStat,
    ViolatorItem,
)
from app.services.common import AnySelect, paginate, vehicle_type_ref, violation_scope
from app.services.timeutil import pct
from app.services.violations import PENDING, ViolationFilters

HOURLY_SERIES_MAX = timedelta(days=2)
TOP_CAMERAS = 10


class ViolatorSort(StrEnum):
    VIOLATIONS = "-violations"
    LAST = "-last_at"
    PLATE = "plate_number"


class ViolationStatsService:
    def __init__(self, session: AsyncSession, tz: tzinfo) -> None:
        self.session = session
        self.tz = tz
        self.tz_name = str(tz)

    # ---------------------------------------------------------------- overview

    async def statistics(
        self, filters: ViolationFilters, camera_limit: int = TOP_CAMERAS
    ) -> ViolationStatistics:
        start, end = _bounds(filters)
        total, unrecognized, avg_conf = (
            await self.session.execute(
                filters.apply(
                    violation_scope(
                        func.count(Violation.id),
                        func.count(Violation.id).filter(Violation.plate_number.is_(None)),
                        func.avg(Violation.ai_confidence),
                    )
                )
            )
        ).one()
        unique_violators, repeat_violators = await self._violator_counts(filters)
        total_vehicles, unique_vehicles = await self._traffic(filters, start, end)
        return ViolationStatistics(
            date_from=start,
            date_to=end,
            total_vehicles=total_vehicles,
            unique_vehicles=unique_vehicles,
            total_violations=total,
            unique_violators=unique_violators,
            repeat_violators=repeat_violators,
            unrecognized_plates=unrecognized,
            avg_confidence=_round(avg_conf),
            violation_rate_pct=round(total / total_vehicles * 100, 3) if total_vehicles else None,
            by_status=await self._by_status(filters),
            by_type=await self._type_stats(filters),
            by_camera=await self._by_camera(filters, camera_limit),
            by_hour=await self._by_hour(filters),
            series=await self._series(filters, start, end),
        )

    async def types(self, filters: ViolationFilters) -> list[ViolationTypeStat]:
        return await self._type_stats(filters)

    async def type_detail(self, type_ref: str, filters: ViolationFilters) -> ViolationTypeDetail:
        condition = (
            ViolationType.id == int(type_ref)
            if type_ref.isdigit()
            else ViolationType.code == type_ref.upper()
        )
        code = await self.session.scalar(select(ViolationType.code).where(condition))
        if code is None:
            raise NotFoundError("Violation type")
        scoped = replace(filters, violation_type=[code])
        start, end = _bounds(scoped)
        # `pct` is the share among all types under the remaining filters.
        unscoped = replace(filters, violation_type=None)
        all_types = await self._type_stats(unscoped, include_all=True)
        stat = next(t for t in all_types if t.code == code)
        return ViolationTypeDetail(
            type=stat,
            by_status=await self._by_status(scoped),
            by_camera=await self._by_camera(scoped),
            by_hour=await self._by_hour(scoped),
            series=await self._series(scoped, start, end),
        )

    # ---------------------------------------------------------------- violators

    async def violators(
        self,
        filters: ViolationFilters,
        page: int,
        page_size: int,
        sort: ViolatorSort,
        min_violations: int = 1,
    ) -> tuple[list[ViolatorItem], PageMeta]:
        grouped = (
            filters.apply(
                violation_scope(
                    Violation.vehicle_id.label("vehicle_id"),
                    func.count(Violation.id).label("n"),
                    func.min(Violation.occurred_at).label("first_at"),
                    func.max(Violation.occurred_at).label("last_at"),
                    func.avg(Violation.ai_confidence).label("avg_conf"),
                )
            )
            .where(Violation.vehicle_id.is_not(None))
            .group_by(Violation.vehicle_id)
        )
        if min_violations > 1:
            grouped = grouped.having(func.count(Violation.id) >= min_violations)
        agg = grouped.subquery("agg")
        owner = aliased(Vehicle, name="owner")
        owner_type = aliased(VehicleType, name="owner_type")
        order: Any = {
            ViolatorSort.VIOLATIONS: (agg.c.n.desc(), agg.c.last_at.desc()),
            ViolatorSort.LAST: (agg.c.last_at.desc(),),
            ViolatorSort.PLATE: (owner.plate_number.asc(),),
        }[sort]
        stmt: AnySelect = (
            select(agg.c.n, agg.c.first_at, agg.c.last_at, agg.c.avg_conf, owner, owner_type)
            .join(owner, owner.id == agg.c.vehicle_id)
            .outerjoin(owner_type, owner.vehicle_type_id == owner_type.id)
            .order_by(*order, owner.id)
        )
        rows, meta = await paginate(self.session, stmt, page, page_size)
        ids = [row[4].id for row in rows]
        types = await self._types_per_vehicle(filters, ids)
        cameras = await self._last_camera_per_vehicle(filters, ids)
        items = [
            ViolatorItem(
                vehicle=VehicleRef.model_validate(vehicle),
                vehicle_type=vehicle_type_ref(vtype),
                status=vehicle.status,
                violations=n,
                first_at=first_at,
                last_at=last_at,
                avg_confidence=_round(avg_conf),
                last_camera=cameras.get(vehicle.id),
                types=types.get(vehicle.id, []),
            )
            for n, first_at, last_at, avg_conf, vehicle, vtype in rows
        ]
        return items, meta

    async def _types_per_vehicle(
        self, filters: ViolationFilters, ids: list[int]
    ) -> dict[int, list[TypeCount]]:
        if not ids:
            return {}
        rows = await self.session.execute(
            filters.apply(
                violation_scope(
                    Violation.vehicle_id,
                    ViolationType.code,
                    ViolationType.name_uz,
                    ViolationType.color,
                    func.count(Violation.id),
                )
            )
            .where(Violation.vehicle_id.in_(ids))
            .group_by(
                Violation.vehicle_id, ViolationType.code, ViolationType.name_uz, ViolationType.color
            )
            .order_by(Violation.vehicle_id, func.count(Violation.id).desc())
        )
        grouped: dict[int, list[tuple[str, str, str, int]]] = {}
        for vehicle_id, code, name, color, count in rows:
            grouped.setdefault(vehicle_id, []).append((code, name, color, count))
        return {
            vehicle_id: [
                TypeCount(
                    code=code,
                    name=name,
                    color=color,
                    count=count,
                    pct=pct(count, sum(i[3] for i in items)),
                )
                for code, name, color, count in items
            ]
            for vehicle_id, items in grouped.items()
        }

    async def _last_camera_per_vehicle(
        self, filters: ViolationFilters, ids: list[int]
    ) -> dict[int, CameraRef]:
        if not ids:
            return {}
        rows = await self.session.execute(
            filters.apply(
                violation_scope(Violation.vehicle_id, Camera.id, Camera.code, Camera.name)
            )
            .where(Violation.vehicle_id.in_(ids))
            .order_by(Violation.vehicle_id, Violation.occurred_at.desc())
            .ext(distinct_on(Violation.vehicle_id))
        )
        return {
            vehicle_id: CameraRef(id=camera_id, code=code, name=name)
            for vehicle_id, camera_id, code, name in rows
        }

    # ---------------------------------------------------------------- building blocks

    async def _violator_counts(self, filters: ViolationFilters) -> tuple[int, int]:
        per_vehicle = (
            filters.apply(violation_scope(func.count(Violation.id).label("n")))
            .where(Violation.vehicle_id.is_not(None))
            .group_by(Violation.vehicle_id)
            .subquery()
        )
        unique, repeat = (
            await self.session.execute(
                select(func.count(), func.count().filter(per_vehicle.c.n > 1)).select_from(
                    per_vehicle
                )
            )
        ).one()
        return int(unique), int(repeat)

    async def _traffic(
        self, filters: ViolationFilters, start: datetime, end: datetime
    ) -> tuple[int, int]:
        """Passing vehicles of the selected cameras; violation-only filters do not apply."""
        place = filters.place_conditions()
        counted = (
            select(func.coalesce(func.sum(TrafficStatsHourly.vehicle_count), 0))
            .select_from(TrafficStatsHourly)
            .join(Camera, TrafficStatsHourly.camera_id == Camera.id)
            .join(Location, Camera.location_id == Location.id)
            .where(
                TrafficStatsHourly.hour_bucket >= start.replace(minute=0, second=0, microsecond=0),
                TrafficStatsHourly.hour_bucket <= end,
                *place,
            )
        )
        detections = (
            select(
                func.count(VehicleDetection.id), func.count(distinct(VehicleDetection.plate_text))
            )
            .select_from(VehicleDetection)
            .join(Camera, VehicleDetection.camera_id == Camera.id)
            .join(Location, Camera.location_id == Location.id)
            .where(
                VehicleDetection.detected_at >= start, VehicleDetection.detected_at <= end, *place
            )
        )
        if filters.vehicle_type:
            counted = counted.join(
                VehicleType, TrafficStatsHourly.vehicle_type_id == VehicleType.id
            ).where(VehicleType.code == filters.vehicle_type)
            detections = detections.join(
                VehicleType, VehicleDetection.vehicle_type_id == VehicleType.id
            ).where(VehicleType.code == filters.vehicle_type)
        total = int(await self.session.scalar(counted) or 0)
        detected, unique = (await self.session.execute(detections)).one()
        # Counters may lag behind raw detections (or be absent); never report fewer passes
        # than individually recorded vehicles.
        return max(total, int(detected)), int(unique)

    async def _type_stats(
        self, filters: ViolationFilters, *, include_all: bool = False
    ) -> list[ViolationTypeStat]:
        rows = await self.session.execute(
            filters.apply(
                violation_scope(
                    ViolationType.id,
                    func.count(Violation.id),
                    func.count(distinct(Violation.vehicle_id)),
                    func.avg(Violation.ai_confidence),
                    func.count(Violation.id).filter(Violation.status.in_(PENDING)),
                    func.count(Violation.id).filter(Violation.status == ViolationStatus.CONFIRMED),
                    func.max(Violation.occurred_at),
                )
            ).group_by(ViolationType.id)
        )
        counts = {row[0]: row[1:] for row in rows}
        total = sum(c[0] for c in counts.values())
        types = await self.session.scalars(select(ViolationType).order_by(ViolationType.id))
        items: list[ViolationTypeStat] = []
        for vtype in types:
            if not (include_all or vtype.is_active or vtype.id in counts):
                continue
            count, vehicles, avg_conf, pending, confirmed, last_at = counts.get(
                vtype.id, (0, 0, None, 0, 0, None)
            )
            items.append(
                ViolationTypeStat(
                    id=vtype.id,
                    code=vtype.code,
                    name=vtype.name_uz,
                    name_en=vtype.name_en,
                    description=vtype.description,
                    severity=vtype.severity,
                    color=vtype.color,
                    icon=vtype.icon,
                    is_active=vtype.is_active,
                    count=count,
                    unique_vehicles=vehicles,
                    pct=pct(count, total),
                    avg_confidence=_round(avg_conf),
                    pending=pending,
                    confirmed=confirmed,
                    last_at=last_at,
                )
            )
        items.sort(key=lambda t: (-t.count, not t.is_active, t.id))
        return items

    async def _by_status(self, filters: ViolationFilters) -> list[StatusCount]:
        result = await self.session.execute(
            filters.apply(violation_scope(Violation.status, func.count(Violation.id))).group_by(
                Violation.status
            )
        )
        rows: dict[ViolationStatus, int] = dict(result.all())
        return [StatusCount(status=s, count=rows.get(s, 0)) for s in ViolationStatus]

    async def _by_camera(
        self, filters: ViolationFilters, limit: int = TOP_CAMERAS
    ) -> list[CameraStat]:
        rows = await self.session.execute(
            filters.apply(
                violation_scope(
                    Camera.id,
                    Camera.code,
                    Camera.name,
                    District.name,
                    func.count(Violation.id),
                    func.count(distinct(Violation.vehicle_id)),
                )
            )
            .group_by(Camera.id, Camera.code, Camera.name, District.name)
            .order_by(func.count(Violation.id).desc(), Camera.id)
            .limit(limit)
        )
        return [
            CameraStat(
                id=cid, code=code, name=name, district=district, count=n, unique_vehicles=vehicles
            )
            for cid, code, name, district, n, vehicles in rows
        ]

    async def _by_hour(self, filters: ViolationFilters) -> list[int]:
        hour = extract("hour", func.timezone(self.tz_name, Violation.occurred_at))
        rows = await self.session.execute(
            filters.apply(violation_scope(hour, func.count(Violation.id))).group_by(hour)
        )
        counts = {int(h): n for h, n in rows}
        return [counts.get(h, 0) for h in range(24)]

    async def _series(
        self, filters: ViolationFilters, start: datetime, end: datetime
    ) -> Timeseries:
        unit = "hour" if end - start <= HOURLY_SERIES_MAX else "day"
        step = timedelta(hours=1) if unit == "hour" else timedelta(days=1)
        local_start = start.astimezone(self.tz).replace(minute=0, second=0, microsecond=0)
        if unit == "day":
            local_start = local_start.replace(hour=0)
        local_end = end.astimezone(self.tz)
        buckets: list[datetime] = []
        cursor = local_start.replace(tzinfo=None)
        while cursor <= local_end.replace(tzinfo=None):
            buckets.append(cursor)
            cursor += step

        bucket = func.date_trunc(unit, func.timezone(self.tz_name, Violation.occurred_at))
        rows = await self.session.execute(
            filters.apply(
                violation_scope(ViolationType.id, bucket, func.count(Violation.id))
            ).group_by(ViolationType.id, bucket)
        )
        counts: dict[tuple[int, datetime], int] = {(t, b): n for t, b, n in rows}
        present = {t for t, _ in counts}
        types = await self.session.execute(
            select(ViolationType.id, ViolationType.code, ViolationType.name_uz, ViolationType.color)
            .where(ViolationType.id.in_(present) | ViolationType.is_active.is_(True))
            .order_by(ViolationType.id)
        )
        series = [
            NamedSeries(
                code=code, name=name, color=color, values=[counts.get((tid, b), 0) for b in buckets]
            )
            for tid, code, name, color in types
        ]
        return Timeseries(
            range="custom",
            bucket=unit,
            buckets=[b.replace(tzinfo=self.tz) for b in buckets],
            series=series,
            totals=[sum(s.values[i] for s in series) for i in range(len(buckets))],
        )


def _bounds(filters: ViolationFilters) -> tuple[datetime, datetime]:
    if filters.date_from is None or filters.date_to is None:
        raise ValueError("statistics require a bounded period")
    return filters.date_from, filters.date_to


def _round(value: float | None) -> float | None:
    return round(float(value), 4) if value is not None else None
