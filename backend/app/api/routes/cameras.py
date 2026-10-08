from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Query

from app.api.deps import CameraViewer, DbSession
from app.api.params import Page, PageSize, TzDep
from app.models.enums import CameraStatus, CameraType, ConnectionType
from app.schemas.common import ApiResponse, error_responses
from app.schemas.domain import (
    CameraDetail,
    CameraListItem,
    CameraStatistics,
    CameraSummary,
    ViolationListItem,
)
from app.schemas.insights import TimeRange
from app.services.cameras import CameraFilters, CameraService, CameraSort
from app.services.violations import ViolationFilters, ViolationService, ViolationSort

router = APIRouter(prefix="/cameras", tags=["Cameras"])


@router.get(
    "",
    summary="List cameras",
    description="Cameras with location, primary connection, latest health metrics and today's "
    "violation count. **Permission:** `cameras.view`.",
    response_model=ApiResponse[list[CameraListItem]],
    responses=error_responses(401, 403),
)
async def list_cameras(
    _: CameraViewer,
    session: DbSession,
    tz: TzDep,
    search: Annotated[str | None, Query(max_length=100)] = None,
    status: CameraStatus | None = None,
    district_id: int | None = None,
    location_id: int | None = None,
    camera_type: CameraType | None = None,
    connection_type: ConnectionType | None = None,
    ai_enabled: bool | None = None,
    sort: CameraSort = CameraSort.CODE,
    page: Page = 1,
    page_size: PageSize = 50,
) -> ApiResponse[list[CameraListItem]]:
    filters = CameraFilters(
        search, status, district_id, location_id, camera_type, connection_type, ai_enabled
    )
    items, meta = await CameraService(session, tz).search(
        filters, page, page_size, sort, datetime.now(UTC)
    )
    return ApiResponse(data=items, meta=meta)


@router.get(
    "/summary",
    summary="Camera status counts",
    response_model=ApiResponse[CameraSummary],
    responses=error_responses(401, 403),
)
async def camera_summary(
    _: CameraViewer, session: DbSession, tz: TzDep
) -> ApiResponse[CameraSummary]:
    return ApiResponse(data=await CameraService(session, tz).summary())


@router.get(
    "/{camera_id}",
    summary="Camera details",
    description="Full camera information. Credentials are never returned.",
    response_model=ApiResponse[CameraDetail],
    responses=error_responses(401, 403, 404),
)
async def camera_detail(
    camera_id: int, _: CameraViewer, session: DbSession, tz: TzDep
) -> ApiResponse[CameraDetail]:
    return ApiResponse(data=await CameraService(session, tz).detail(camera_id, datetime.now(UTC)))


@router.get(
    "/{camera_id}/statistics",
    summary="Camera statistics",
    response_model=ApiResponse[CameraStatistics],
    responses=error_responses(401, 403, 404),
)
async def camera_statistics(
    camera_id: int,
    _: CameraViewer,
    session: DbSession,
    tz: TzDep,
    range: TimeRange = TimeRange.H24,  # noqa: A002
) -> ApiResponse[CameraStatistics]:
    return ApiResponse(
        data=await CameraService(session, tz).statistics(camera_id, range, datetime.now(UTC))
    )


@router.get(
    "/{camera_id}/events",
    summary="Recent violations of a camera",
    response_model=ApiResponse[list[ViolationListItem]],
    responses=error_responses(401, 403),
)
async def camera_events(
    camera_id: int,
    _: CameraViewer,
    session: DbSession,
    limit: Annotated[int, Query(ge=1, le=50)] = 10,
) -> ApiResponse[list[ViolationListItem]]:
    items, _meta = await ViolationService(session).search(
        ViolationFilters(camera_id=camera_id), 1, limit, ViolationSort.OCCURRED_DESC
    )
    return ApiResponse(data=items)
