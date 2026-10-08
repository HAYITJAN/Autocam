from dataclasses import dataclass
from datetime import datetime, timedelta
from enum import StrEnum
from typing import Any

from sqlalchemy import distinct, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError
from app.models import Camera, Vehicle, VehicleType, Violation, ViolationType
from app.models.enums import VehicleStatus
from app.schemas.common import PageMeta
from app.schemas.domain import (
    CameraRef,
    TypeCount,
    VehicleDetail,
    VehicleListItem,
    VehicleSummary,
)
from app.services.audit import ClientInfo, record_audit
from app.services.common import AnySelect, paginate, vehicle_type_ref
from app.services.timeutil import pct
from app.services.violations import normalize_plate


class VehicleSort(StrEnum):
    LAST_SEEN = "-last_seen_at"
    VIOLATIONS = "-total_violations"
    DETECTIONS = "-total_detections"
    PLATE = "plate_number"


@dataclass(slots=True)
class VehicleFilters:
    search: str | None = None
    vehicle_type: str | None = None
    status: VehicleStatus | None = None
    has_violations: bool | None = None


def _rows() -> AnySelect:
    return (
        select(Vehicle, VehicleType, Camera)
        .outerjoin(VehicleType, Vehicle.vehicle_type_id == VehicleType.id)
        .outerjoin(Camera, Vehicle.last_camera_id == Camera.id)
    )


def _item(row: Any) -> VehicleListItem:
    vehicle, vtype, camera = row
    return VehicleListItem(
        id=vehicle.id,
        plate_number=vehicle.plate_number,
        plate_display=vehicle.plate_display,
        vehicle_type=vehicle_type_ref(vtype),
        brand=vehicle.brand,
        model=vehicle.model,
        color=vehicle.color,
        country=vehicle.country,
        status=vehicle.status,
        status_reason=vehicle.status_reason,
        total_detections=vehicle.total_detections,
        total_violations=vehicle.total_violations,
        first_seen_at=vehicle.first_seen_at,
        last_seen_at=vehicle.last_seen_at,
        last_camera=CameraRef(id=camera.id, code=camera.code, name=camera.name) if camera else None,
    )


class VehicleService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def search(
        self, filters: VehicleFilters, page: int, page_size: int, sort: VehicleSort
    ) -> tuple[list[VehicleListItem], PageMeta]:
        stmt = _rows()
        if filters.search:
            term = filters.search.strip()
            plate = normalize_plate(term)
            condition = Vehicle.brand.ilike(f"%{term}%") | Vehicle.model.ilike(f"%{term}%")
            if plate:
                condition = condition | Vehicle.plate_number.contains(plate)
            stmt = stmt.where(condition)
        if filters.vehicle_type:
            stmt = stmt.where(VehicleType.code == filters.vehicle_type)
        if filters.status:
            stmt = stmt.where(Vehicle.status == filters.status)
        if filters.has_violations is not None:
            stmt = stmt.where(
                Vehicle.total_violations > 0
                if filters.has_violations
                else Vehicle.total_violations == 0
            )
        order: Any = {
            VehicleSort.LAST_SEEN: Vehicle.last_seen_at.desc().nulls_last(),
            VehicleSort.VIOLATIONS: Vehicle.total_violations.desc(),
            VehicleSort.DETECTIONS: Vehicle.total_detections.desc(),
            VehicleSort.PLATE: Vehicle.plate_number.asc(),
        }[sort]
        rows, meta = await paginate(self.session, stmt.order_by(order, Vehicle.id), page, page_size)
        return [_item(row) for row in rows], meta

    async def summary(self, now: datetime) -> VehicleSummary:
        total, active, with_violations, blacklisted, watchlist = (
            await self.session.execute(
                select(
                    func.count(),
                    func.count().filter(Vehicle.last_seen_at >= now - timedelta(hours=24)),
                    func.count().filter(Vehicle.total_violations > 0),
                    func.count().filter(Vehicle.status == VehicleStatus.BLACKLIST),
                    func.count().filter(Vehicle.status == VehicleStatus.WATCHLIST),
                ).select_from(Vehicle)
            )
        ).one()
        by_type = (
            await self.session.execute(
                select(VehicleType.code, VehicleType.name_uz, VehicleType.color, func.count())
                .join(Vehicle, Vehicle.vehicle_type_id == VehicleType.id)
                .group_by(VehicleType.code, VehicleType.name_uz, VehicleType.color)
                .order_by(func.count().desc())
            )
        ).all()
        return VehicleSummary(
            total=total,
            active_24h=active,
            with_violations=with_violations,
            blacklisted=blacklisted,
            watchlist=watchlist,
            by_type=[
                TypeCount(code=c, name=n, color=col, count=k, pct=pct(k, total))
                for c, n, col, k in by_type
            ],
        )

    async def detail(self, vehicle_id: int) -> VehicleDetail:
        row = (await self.session.execute(_rows().where(Vehicle.id == vehicle_id))).one_or_none()
        if row is None:
            raise NotFoundError("Vehicle")
        vehicle: Vehicle = row[0]
        by_type = (
            await self.session.execute(
                select(ViolationType.code, ViolationType.name_uz, ViolationType.color, func.count())
                .join(Violation, Violation.violation_type_id == ViolationType.id)
                .where(Violation.vehicle_id == vehicle_id)
                .group_by(ViolationType.code, ViolationType.name_uz, ViolationType.color)
                .order_by(func.count().desc())
            )
        ).all()
        total = sum(int(k) for *_, k in by_type)
        first_at, last_at, cameras = (
            await self.session.execute(
                select(
                    func.min(Violation.occurred_at),
                    func.max(Violation.occurred_at),
                    func.count(distinct(Violation.camera_id)),
                ).where(Violation.vehicle_id == vehicle_id)
            )
        ).one()
        return VehicleDetail(
            **_item(row).model_dump(),
            vin=vehicle.vin,
            owner_name=vehicle.owner_name,
            notes=vehicle.notes,
            violations_count=total,
            first_violation_at=first_at,
            last_violation_at=last_at,
            violation_cameras=cameras,
            violations_by_type=[
                TypeCount(code=c, name=n, color=col, count=k, pct=pct(k, total))
                for c, n, col, k in by_type
            ],
        )

    async def set_status(
        self,
        vehicle_id: int,
        status: VehicleStatus,
        reason: str | None,
        *,
        user_id: int,
        client: ClientInfo,
    ) -> None:
        vehicle = await self.session.scalar(
            select(Vehicle).where(Vehicle.id == vehicle_id).with_for_update()
        )
        if vehicle is None:
            raise NotFoundError("Vehicle")
        previous = vehicle.status
        vehicle.status = status
        vehicle.status_reason = reason
        record_audit(
            self.session,
            f"VEHICLE_{status.value}",
            user_id=user_id,
            client=client,
            entity_type="vehicle",
            entity_id=vehicle_id,
            meta={"from": previous.value, "to": status.value, "reason": reason},
        )
        await self.session.commit()
