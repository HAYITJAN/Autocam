from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Query

from app.api.deps import (
    ClientDep,
    CurrentUser,
    DbSession,
    ViolationConfirmer,
    ViolationRejecter,
    ViolationReviewer,
    ViolationViewer,
)
from app.api.params import Page, PageSize, TzDep
from app.models.enums import ViolationStatus
from app.schemas.common import ApiResponse, error_responses
from app.schemas.domain import (
    CommentRequest,
    ConfirmRequest,
    RejectRequest,
    ViolationDetail,
    ViolationListItem,
    ViolationSummary,
)
from app.services.violations import (
    ViolationAction,
    ViolationFilters,
    ViolationService,
    ViolationSort,
)

router = APIRouter(prefix="/violations", tags=["Violations"])

TRANSITION_ERRORS = error_responses(401, 403, 404, 409)


@router.get(
    "",
    summary="List violations",
    description="Paginated, filterable violation list. **Permission:** `violations.view`.",
    response_model=ApiResponse[list[ViolationListItem]],
    responses=error_responses(401, 403, 422),
)
async def list_violations(
    _: ViolationViewer,
    session: DbSession,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    status: Annotated[list[ViolationStatus] | None, Query()] = None,
    violation_type: Annotated[list[str] | None, Query()] = None,
    camera_id: int | None = None,
    location_id: int | None = None,
    district_id: int | None = None,
    vehicle_type: str | None = None,
    vehicle_id: int | None = None,
    plate: Annotated[str | None, Query(max_length=20)] = None,
    search: Annotated[str | None, Query(max_length=50)] = None,
    confidence_min: Annotated[float | None, Query(ge=0, le=1)] = None,
    confidence_max: Annotated[float | None, Query(ge=0, le=1)] = None,
    assigned_to: int | None = None,
    sort: ViolationSort = ViolationSort.OCCURRED_DESC,
    page: Page = 1,
    page_size: PageSize = 20,
) -> ApiResponse[list[ViolationListItem]]:
    filters = ViolationFilters(
        date_from=date_from,
        date_to=date_to,
        status=status,
        violation_type=violation_type,
        camera_id=camera_id,
        location_id=location_id,
        district_id=district_id,
        vehicle_type=vehicle_type,
        vehicle_id=vehicle_id,
        plate=plate,
        search=search,
        confidence_min=confidence_min,
        confidence_max=confidence_max,
        assigned_to=assigned_to,
    )
    items, meta = await ViolationService(session).search(filters, page, page_size, sort)
    return ApiResponse(data=items, meta=meta)


@router.get(
    "/summary",
    summary="Violation counters",
    response_model=ApiResponse[ViolationSummary],
    responses=error_responses(401, 403),
)
async def violation_summary(
    _: ViolationViewer, session: DbSession, tz: TzDep
) -> ApiResponse[ViolationSummary]:
    return ApiResponse(data=await ViolationService(session).summary(datetime.now(UTC), tz))


@router.get(
    "/{violation_id}",
    summary="Violation details",
    description="Details with timeline, evidence metadata and the actions allowed for the caller.",
    response_model=ApiResponse[ViolationDetail],
    responses=error_responses(401, 403, 404),
)
async def violation_detail(
    violation_id: int, user: ViolationViewer, session: DbSession
) -> ApiResponse[ViolationDetail]:
    detail = await ViolationService(session).detail(violation_id, user.permissions, user.role_code)
    return ApiResponse(data=detail)


async def _transition(
    session: DbSession,
    violation_id: int,
    action: ViolationAction,
    user: CurrentUser,
    client: ClientDep,
    comment: str | None = None,
) -> ApiResponse[ViolationDetail]:
    service = ViolationService(session)
    await service.transition(
        violation_id,
        action,
        user_id=user.id,
        permissions=user.permissions,
        role=user.role_code,
        client=client,
        comment=comment,
    )
    return ApiResponse(data=await service.detail(violation_id, user.permissions, user.role_code))


@router.post(
    "/{violation_id}/review",
    summary="Start review (NEW → UNDER_REVIEW)",
    response_model=ApiResponse[ViolationDetail],
    responses=TRANSITION_ERRORS,
)
async def review(
    violation_id: int, user: ViolationReviewer, session: DbSession, client: ClientDep
) -> ApiResponse[ViolationDetail]:
    return await _transition(session, violation_id, ViolationAction.REVIEW, user, client)


@router.post(
    "/{violation_id}/confirm",
    summary="Confirm",
    response_model=ApiResponse[ViolationDetail],
    responses=TRANSITION_ERRORS,
)
async def confirm(
    violation_id: int,
    body: ConfirmRequest,
    user: ViolationConfirmer,
    session: DbSession,
    client: ClientDep,
) -> ApiResponse[ViolationDetail]:
    return await _transition(
        session, violation_id, ViolationAction.CONFIRM, user, client, body.comment
    )


@router.post(
    "/{violation_id}/reject",
    summary="Reject (reason required)",
    response_model=ApiResponse[ViolationDetail],
    responses=TRANSITION_ERRORS,
)
async def reject(
    violation_id: int,
    body: RejectRequest,
    user: ViolationRejecter,
    session: DbSession,
    client: ClientDep,
) -> ApiResponse[ViolationDetail]:
    return await _transition(
        session, violation_id, ViolationAction.REJECT, user, client, body.reason
    )


@router.post(
    "/{violation_id}/archive",
    summary="Archive (CONFIRMED/REJECTED → ARCHIVED)",
    response_model=ApiResponse[ViolationDetail],
    responses=TRANSITION_ERRORS,
)
async def archive(
    violation_id: int, user: ViolationConfirmer, session: DbSession, client: ClientDep
) -> ApiResponse[ViolationDetail]:
    return await _transition(session, violation_id, ViolationAction.ARCHIVE, user, client)


@router.post(
    "/{violation_id}/reopen",
    summary="Reopen a rejected violation (supervisor/admin)",
    response_model=ApiResponse[ViolationDetail],
    responses=TRANSITION_ERRORS,
)
async def reopen(
    violation_id: int, user: ViolationConfirmer, session: DbSession, client: ClientDep
) -> ApiResponse[ViolationDetail]:
    return await _transition(session, violation_id, ViolationAction.REOPEN, user, client)


@router.post(
    "/{violation_id}/comments",
    summary="Add a comment",
    response_model=ApiResponse[ViolationDetail],
    responses=error_responses(401, 403, 404, 422),
)
async def add_comment(
    violation_id: int,
    body: CommentRequest,
    user: ViolationReviewer,
    session: DbSession,
    client: ClientDep,
) -> ApiResponse[ViolationDetail]:
    service = ViolationService(session)
    await service.add_comment(violation_id, body.comment, user_id=user.id, client=client)
    return ApiResponse(data=await service.detail(violation_id, user.permissions, user.role_code))
