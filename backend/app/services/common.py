"""Shared query helpers and ORM → schema mappers."""

from math import ceil
from typing import Any

from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.models import (
    Camera,
    District,
    Location,
    User,
    Vehicle,
    VehicleType,
    Violation,
    ViolationType,
)
from app.schemas.common import PageMeta
from app.schemas.domain import (
    CameraRef,
    DistrictRef,
    LocationRef,
    UserRef,
    VehicleRef,
    VehicleTypeRef,
    ViolationListItem,
    ViolationTypeRef,
)

MAX_PAGE_SIZE = 100

type AnySelect = Select[*tuple[Any, ...]]


async def paginate(
    session: AsyncSession, stmt: AnySelect, page: int, page_size: int
) -> tuple[list[Any], PageMeta]:
    total = await session.scalar(select(func.count()).select_from(stmt.order_by(None).subquery()))
    rows = (await session.execute(stmt.limit(page_size).offset((page - 1) * page_size))).all()
    total = int(total or 0)
    return list(rows), PageMeta(
        page=page, page_size=page_size, total=total, pages=ceil(total / page_size) if total else 0
    )


def user_ref(user: User | None) -> UserRef | None:
    if user is None:
        return None
    return UserRef(id=user.id, full_name=user.full_name, username=user.username)


def vehicle_type_ref(vt: VehicleType | None) -> VehicleTypeRef | None:
    if vt is None:
        return None
    return VehicleTypeRef(id=vt.id, code=vt.code, name_uz=vt.name_uz, color=vt.color, icon=vt.icon)


def location_ref(location: Location | None, district: District | None) -> LocationRef | None:
    if location is None or district is None:
        return None
    return LocationRef(
        id=location.id,
        name=location.name,
        location_type=location.location_type,
        latitude=location.latitude,
        longitude=location.longitude,
        district=DistrictRef(id=district.id, code=district.code, name=district.name),
    )


AssignedUser = aliased(User, name="assigned_user")


def violation_scope(*columns: Any) -> AnySelect:
    """Violation events joined with everything `ViolationFilters` can filter on.

    Every list, statistic and grouping is built on this so that one filter set
    yields consistent numbers across KPIs, charts and tables.
    """
    return (
        select(*columns)
        .select_from(Violation)
        .join(ViolationType, Violation.violation_type_id == ViolationType.id)
        .join(Camera, Violation.camera_id == Camera.id)
        .outerjoin(Location, Violation.location_id == Location.id)
        .outerjoin(District, Location.district_id == District.id)
        .outerjoin(VehicleType, Violation.vehicle_type_id == VehicleType.id)
        .outerjoin(Vehicle, Violation.vehicle_id == Vehicle.id)
    )


def violation_rows_stmt() -> AnySelect:
    return violation_scope(
        Violation, ViolationType, Camera, Location, District, VehicleType, Vehicle, AssignedUser
    ).outerjoin(AssignedUser, Violation.assigned_to == AssignedUser.id)


def type_ref(vtype: ViolationType) -> ViolationTypeRef:
    return ViolationTypeRef(
        id=vtype.id,
        code=vtype.code,
        name_uz=vtype.name_uz,
        severity=vtype.severity,
        color=vtype.color,
        icon=vtype.icon,
    )


def vehicle_ref(vehicle: Vehicle | None) -> VehicleRef | None:
    if vehicle is None:
        return None
    return VehicleRef(
        id=vehicle.id,
        plate_number=vehicle.plate_number,
        plate_display=vehicle.plate_display,
        brand=vehicle.brand,
        model=vehicle.model,
        color=vehicle.color,
        country=vehicle.country,
    )


def camera_ref(camera: Camera | None) -> CameraRef | None:
    if camera is None:
        return None
    return CameraRef(id=camera.id, code=camera.code, name=camera.name)


def violation_item(row: Any) -> ViolationListItem:
    violation, vtype, camera, location, district, vehicle_type, vehicle, assigned = row
    return ViolationListItem(
        id=violation.id,
        code=violation.code,
        status=violation.status,
        occurred_at=violation.occurred_at,
        plate_number=violation.plate_number,
        ai_confidence=violation.ai_confidence,
        detected_speed=violation.detected_speed,
        speed_limit=violation.speed_limit,
        direction=violation.direction,
        type=type_ref(vtype),
        camera=CameraRef(id=camera.id, code=camera.code, name=camera.name),
        location_name=location.name if location else None,
        district_name=district.name if district else None,
        vehicle=vehicle_ref(vehicle),
        vehicle_type=vehicle_type_ref(vehicle_type),
        assigned_to=user_ref(assigned),
    )
