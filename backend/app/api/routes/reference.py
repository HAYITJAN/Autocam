"""Small reference lists used by filters and forms."""

from fastapi import APIRouter
from sqlalchemy import select

from app.api.deps import CurrentUserDep, DbSession, UserViewer
from app.models import District, Role, User, VehicleType, ViolationType
from app.models.enums import UserStatus
from app.schemas.common import ApiModel, ApiResponse, error_responses
from app.schemas.domain import DistrictRef, VehicleTypeRef, ViolationTypeOut

router = APIRouter(tags=["Reference"])


class UserListItem(ApiModel):
    id: int
    username: str
    full_name: str
    email: str
    role: str
    role_name: str
    status: UserStatus


@router.get(
    "/violation-types",
    summary="Violation types",
    response_model=ApiResponse[list[ViolationTypeOut]],
    responses=error_responses(401),
)
async def violation_types(
    _: CurrentUserDep, session: DbSession
) -> ApiResponse[list[ViolationTypeOut]]:
    rows = await session.scalars(select(ViolationType).order_by(ViolationType.id))
    return ApiResponse(data=[ViolationTypeOut.model_validate(row) for row in rows])


@router.get(
    "/vehicle-types",
    summary="Vehicle types",
    response_model=ApiResponse[list[VehicleTypeRef]],
    responses=error_responses(401),
)
async def vehicle_types(_: CurrentUserDep, session: DbSession) -> ApiResponse[list[VehicleTypeRef]]:
    rows = await session.scalars(select(VehicleType).order_by(VehicleType.id))
    return ApiResponse(data=[VehicleTypeRef.model_validate(row) for row in rows])


@router.get(
    "/districts",
    summary="Districts",
    response_model=ApiResponse[list[DistrictRef]],
    responses=error_responses(401),
)
async def districts(_: CurrentUserDep, session: DbSession) -> ApiResponse[list[DistrictRef]]:
    rows = await session.scalars(select(District).order_by(District.name))
    return ApiResponse(data=[DistrictRef.model_validate(row) for row in rows])


@router.get(
    "/users",
    summary="Users (read-only list)",
    response_model=ApiResponse[list[UserListItem]],
    responses=error_responses(401, 403),
)
async def users(_: UserViewer, session: DbSession) -> ApiResponse[list[UserListItem]]:
    rows = await session.execute(
        select(User, Role)
        .join(Role, User.role_id == Role.id)
        .where(User.deleted_at.is_(None))
        .order_by(User.full_name)
    )
    return ApiResponse(
        data=[
            UserListItem(
                id=user.id,
                username=user.username,
                full_name=user.full_name,
                email=user.email,
                role=role.code,
                role_name=role.name,
                status=user.status,
            )
            for user, role in rows
        ]
    )
