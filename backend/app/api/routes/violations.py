from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Path, Query

from app.api.deps import (
    ClientDep,
    CurrentUser,
    DbSession,
    MediaSignerDep,
    ViolationConfirmer,
    ViolationRejecter,
    ViolationReviewer,
    ViolationViewer,
)
from app.api.params import (
    BoundedViolationFiltersDep,
    Page,
    PageSize,
    TzDep,
    ViolationFiltersDep,
)
from app.schemas.common import ApiResponse, error_responses
from app.schemas.domain import (
    CommentRequest,
    ConfirmRequest,
    EvidenceOut,
    RejectRequest,
    ViolationDetail,
    ViolationListItem,
    ViolationSummary,
)
from app.schemas.violation_stats import (
    ViolationStatistics,
    ViolationTypeDetail,
    ViolationTypeStat,
    ViolatorItem,
)
from app.services.media import MediaSigner
from app.services.violation_stats import ViolationStatsService, ViolatorSort
from app.services.violations import ViolationAction, ViolationService, ViolationSort

router = APIRouter(prefix="/violations", tags=["Violations"])

TRANSITION_ERRORS = error_responses(401, 403, 404, 409)
FILTERS_NOTE = (
    "Accepts the same filters as `GET /violations`; without `date_from`/`date_to` the "
    "last 30 days are used."
)


@router.get(
    "",
    summary="List violation events",
    description=(
        "Paginated, filterable list of violation events (one row per event, so a vehicle "
        "with three violations appears three times). **Permission:** `violations.view`."
    ),
    response_model=ApiResponse[list[ViolationListItem]],
    responses=error_responses(401, 403, 422),
)
async def list_violations(
    _: ViolationViewer,
    session: DbSession,
    filters: ViolationFiltersDep,
    sort: ViolationSort = ViolationSort.OCCURRED_DESC,
    page: Page = 1,
    page_size: PageSize = 20,
) -> ApiResponse[list[ViolationListItem]]:
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
    "/statistics",
    summary="Violation statistics for the selected filters",
    description=(
        "KPIs (passing vehicles, unique vehicles, events, unique and repeat violators, "
        "average AI confidence), events by type/status/camera/hour and a time series. "
        f"{FILTERS_NOTE} Traffic volume only honours place and time filters."
    ),
    response_model=ApiResponse[ViolationStatistics],
    responses=error_responses(401, 403, 422),
)
async def violation_statistics(
    _: ViolationViewer,
    session: DbSession,
    tz: TzDep,
    filters: BoundedViolationFiltersDep,
    camera_limit: Annotated[int, Query(ge=1, le=500, description="Rows in `by_camera`")] = 10,
) -> ApiResponse[ViolationStatistics]:
    stats = await ViolationStatsService(session, tz).statistics(filters, camera_limit)
    return ApiResponse(data=stats)


@router.get(
    "/types",
    summary="Violation types with event counts",
    description=(
        f"Every active type (and any type with events) with its event count. {FILTERS_NOTE}"
    ),
    response_model=ApiResponse[list[ViolationTypeStat]],
    responses=error_responses(401, 403, 422),
)
async def violation_types(
    _: ViolationViewer, session: DbSession, tz: TzDep, filters: BoundedViolationFiltersDep
) -> ApiResponse[list[ViolationTypeStat]]:
    return ApiResponse(data=await ViolationStatsService(session, tz).types(filters))


@router.get(
    "/types/{type_ref}",
    summary="One violation type with its statistics",
    description=(
        "`type_ref` is the numeric id or the code (e.g. `RED_LIGHT`). Events of the type "
        f"are listed by `GET /violations?violation_type=CODE`. {FILTERS_NOTE}"
    ),
    response_model=ApiResponse[ViolationTypeDetail],
    responses=error_responses(401, 403, 404, 422),
)
async def violation_type_detail(
    type_ref: Annotated[str, Path(max_length=40, pattern=r"^[A-Za-z0-9_]+$")],
    _: ViolationViewer,
    session: DbSession,
    tz: TzDep,
    filters: BoundedViolationFiltersDep,
) -> ApiResponse[ViolationTypeDetail]:
    detail = await ViolationStatsService(session, tz).type_detail(type_ref, filters)
    return ApiResponse(data=detail)


@router.get(
    "/vehicles",
    summary="Violating vehicles",
    description=(
        "Recognised vehicles grouped from the matching events, with their event count, "
        f"types and last camera. `min_violations=2` lists repeat violators. {FILTERS_NOTE}"
    ),
    response_model=ApiResponse[list[ViolatorItem]],
    responses=error_responses(401, 403, 422),
)
async def violating_vehicles(
    _: ViolationViewer,
    session: DbSession,
    tz: TzDep,
    filters: BoundedViolationFiltersDep,
    min_violations: Annotated[int, Query(ge=1, le=1000)] = 1,
    sort: ViolatorSort = ViolatorSort.VIOLATIONS,
    page: Page = 1,
    page_size: PageSize = 20,
) -> ApiResponse[list[ViolatorItem]]:
    items, meta = await ViolationStatsService(session, tz).violators(
        filters, page, page_size, sort, min_violations
    )
    return ApiResponse(data=items, meta=meta)


@router.get(
    "/{violation_id}",
    summary="Violation details",
    description=(
        "Details with timeline, evidence (signed URLs) and the actions allowed for the caller."
    ),
    response_model=ApiResponse[ViolationDetail],
    responses=error_responses(401, 403, 404),
)
async def violation_detail(
    violation_id: int, user: ViolationViewer, session: DbSession, signer: MediaSignerDep
) -> ApiResponse[ViolationDetail]:
    detail = await ViolationService(session).detail(
        violation_id, user.permissions, user.role_code, signer
    )
    return ApiResponse(data=detail)


@router.get(
    "/{violation_id}/evidence",
    summary="Evidence of a violation",
    description=(
        "Full frame, vehicle, plate, context frames and video with short-lived signed "
        "`file_url`/`thumbnail_url`."
    ),
    response_model=ApiResponse[list[EvidenceOut]],
    responses=error_responses(401, 403, 404),
)
async def violation_evidence(
    violation_id: int, _: ViolationViewer, session: DbSession, signer: MediaSignerDep
) -> ApiResponse[list[EvidenceOut]]:
    return ApiResponse(data=await ViolationService(session).evidence(violation_id, signer))


async def _transition(
    session: DbSession,
    violation_id: int,
    action: ViolationAction,
    user: CurrentUser,
    client: ClientDep,
    signer: MediaSigner,
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
    return ApiResponse(
        data=await service.detail(violation_id, user.permissions, user.role_code, signer)
    )


@router.post(
    "/{violation_id}/review",
    summary="Start review (NEW → UNDER_REVIEW)",
    response_model=ApiResponse[ViolationDetail],
    responses=TRANSITION_ERRORS,
)
async def review(
    violation_id: int,
    user: ViolationReviewer,
    session: DbSession,
    client: ClientDep,
    signer: MediaSignerDep,
) -> ApiResponse[ViolationDetail]:
    return await _transition(session, violation_id, ViolationAction.REVIEW, user, client, signer)


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
    signer: MediaSignerDep,
) -> ApiResponse[ViolationDetail]:
    return await _transition(
        session, violation_id, ViolationAction.CONFIRM, user, client, signer, body.comment
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
    signer: MediaSignerDep,
) -> ApiResponse[ViolationDetail]:
    return await _transition(
        session, violation_id, ViolationAction.REJECT, user, client, signer, body.reason
    )


@router.post(
    "/{violation_id}/archive",
    summary="Archive (CONFIRMED/REJECTED → ARCHIVED)",
    response_model=ApiResponse[ViolationDetail],
    responses=TRANSITION_ERRORS,
)
async def archive(
    violation_id: int,
    user: ViolationConfirmer,
    session: DbSession,
    client: ClientDep,
    signer: MediaSignerDep,
) -> ApiResponse[ViolationDetail]:
    return await _transition(session, violation_id, ViolationAction.ARCHIVE, user, client, signer)


@router.post(
    "/{violation_id}/reopen",
    summary="Reopen a rejected violation (supervisor/admin)",
    response_model=ApiResponse[ViolationDetail],
    responses=TRANSITION_ERRORS,
)
async def reopen(
    violation_id: int,
    user: ViolationConfirmer,
    session: DbSession,
    client: ClientDep,
    signer: MediaSignerDep,
) -> ApiResponse[ViolationDetail]:
    return await _transition(session, violation_id, ViolationAction.REOPEN, user, client, signer)


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
    signer: MediaSignerDep,
) -> ApiResponse[ViolationDetail]:
    service = ViolationService(session)
    await service.add_comment(violation_id, body.comment, user_id=user.id, client=client)
    return ApiResponse(
        data=await service.detail(violation_id, user.permissions, user.role_code, signer)
    )
