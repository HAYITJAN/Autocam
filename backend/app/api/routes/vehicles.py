from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Query

from app.api.deps import ClientDep, DbSession, VehicleViewer, ViolationReviewer, ViolationViewer
from app.api.params import Page, PageSize
from app.models.enums import VehicleStatus
from app.schemas.common import ApiResponse, error_responses
from app.schemas.domain import (
    VehicleDetail,
    VehicleListItem,
    VehicleStatusRequest,
    VehicleSummary,
    ViolationListItem,
)
from app.services.vehicles import VehicleFilters, VehicleService, VehicleSort
from app.services.violations import ViolationFilters, ViolationService, ViolationSort

router = APIRouter(prefix="/vehicles", tags=["Vehicles"])


@router.get(
    "",
    summary="List vehicles",
    response_model=ApiResponse[list[VehicleListItem]],
    responses=error_responses(401, 403),
)
async def list_vehicles(
    _: VehicleViewer,
    session: DbSession,
    search: Annotated[str | None, Query(max_length=50)] = None,
    vehicle_type: str | None = None,
    status: VehicleStatus | None = None,
    has_violations: bool | None = None,
    sort: VehicleSort = VehicleSort.LAST_SEEN,
    page: Page = 1,
    page_size: PageSize = 20,
) -> ApiResponse[list[VehicleListItem]]:
    filters = VehicleFilters(search, vehicle_type, status, has_violations)
    items, meta = await VehicleService(session).search(filters, page, page_size, sort)
    return ApiResponse(data=items, meta=meta)


@router.get(
    "/summary",
    summary="Vehicle counters",
    response_model=ApiResponse[VehicleSummary],
    responses=error_responses(401, 403),
)
async def vehicle_summary(_: VehicleViewer, session: DbSession) -> ApiResponse[VehicleSummary]:
    return ApiResponse(data=await VehicleService(session).summary(datetime.now(UTC)))


@router.get(
    "/{vehicle_id}",
    summary="Vehicle details",
    response_model=ApiResponse[VehicleDetail],
    responses=error_responses(401, 403, 404),
)
async def vehicle_detail(
    vehicle_id: int, _: VehicleViewer, session: DbSession
) -> ApiResponse[VehicleDetail]:
    return ApiResponse(data=await VehicleService(session).detail(vehicle_id))


@router.get(
    "/{vehicle_id}/violations",
    summary="Violations of a vehicle",
    response_model=ApiResponse[list[ViolationListItem]],
    responses=error_responses(401, 403),
)
async def vehicle_violations(
    vehicle_id: int,
    _: ViolationViewer,
    session: DbSession,
    page: Page = 1,
    page_size: PageSize = 20,
) -> ApiResponse[list[ViolationListItem]]:
    items, meta = await ViolationService(session).search(
        ViolationFilters(vehicle_id=vehicle_id), page, page_size, ViolationSort.OCCURRED_DESC
    )
    return ApiResponse(data=items, meta=meta)


@router.post(
    "/{vehicle_id}/status",
    summary="Set watchlist/blacklist status",
    response_model=ApiResponse[VehicleDetail],
    responses=error_responses(401, 403, 404, 422),
)
async def set_vehicle_status(
    vehicle_id: int,
    body: VehicleStatusRequest,
    user: ViolationReviewer,
    session: DbSession,
    client: ClientDep,
) -> ApiResponse[VehicleDetail]:
    service = VehicleService(session)
    await service.set_status(vehicle_id, body.status, body.reason, user_id=user.id, client=client)
    return ApiResponse(data=await service.detail(vehicle_id))
