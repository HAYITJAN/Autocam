from enum import StrEnum

from fastapi import APIRouter, status
from fastapi.responses import Response

from app.api.deps import CurrentUserDep, DbSession
from app.api.params import Page, PageSize
from app.models.enums import NotificationState, NotificationType
from app.schemas.common import ApiResponse, error_responses
from app.schemas.domain import NotificationOut, UnreadCount
from app.services.notifications import NotificationService

router = APIRouter(prefix="/notifications", tags=["Notifications"])


class NotificationAction(StrEnum):
    READ = "read"
    UNREAD = "unread"
    ARCHIVE = "archive"


_STATES = {
    NotificationAction.READ: NotificationState.READ,
    NotificationAction.UNREAD: NotificationState.UNREAD,
    NotificationAction.ARCHIVE: NotificationState.ARCHIVED,
}


@router.get(
    "",
    summary="Own notifications",
    response_model=ApiResponse[list[NotificationOut]],
    responses=error_responses(401),
)
async def list_notifications(
    user: CurrentUserDep,
    session: DbSession,
    state: NotificationState | None = None,
    type: NotificationType | None = None,  # noqa: A002
    page: Page = 1,
    page_size: PageSize = 20,
) -> ApiResponse[list[NotificationOut]]:
    items, meta = await NotificationService(session, user.id).search(state, type, page, page_size)
    return ApiResponse(data=items, meta=meta)


@router.get(
    "/unread-count",
    summary="Unread badge count",
    response_model=ApiResponse[UnreadCount],
    responses=error_responses(401),
)
async def unread_count(user: CurrentUserDep, session: DbSession) -> ApiResponse[UnreadCount]:
    return ApiResponse(data=await NotificationService(session, user.id).unread_count())


@router.post(
    "/read-all",
    summary="Mark all as read",
    response_model=ApiResponse[dict[str, int]],
    responses=error_responses(401),
)
async def read_all(user: CurrentUserDep, session: DbSession) -> ApiResponse[dict[str, int]]:
    updated = await NotificationService(session, user.id).read_all()
    return ApiResponse(data={"updated": updated})


@router.post(
    "/{notification_id}/{action}",
    summary="Change state (read / unread / archive)",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=error_responses(401, 404, 422),
)
async def change_state(
    notification_id: int,
    action: NotificationAction,
    user: CurrentUserDep,
    session: DbSession,
) -> Response:
    await NotificationService(session, user.id).set_state(notification_id, _STATES[action])
    return Response(status_code=status.HTTP_204_NO_CONTENT)
