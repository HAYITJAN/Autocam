from datetime import timedelta

from fastapi import APIRouter, Response, status

from app.api.deps import DbSession, ServiceAuth, SettingsDep
from app.schemas.common import ApiResponse, error_responses
from app.schemas.ingestion import ViolationIngest, ViolationIngestResult
from app.services.ingestion import ViolationIngestService

router = APIRouter(prefix="/internal", tags=["Internal"], dependencies=[ServiceAuth])


@router.post(
    "/violations",
    summary="Ingest a violation event from the AI service",
    description=(
        "Authenticated with the `X-Service-Token` header. Reports of the same vehicle, "
        "camera and violation type within `VIOLATION_DEDUP_WINDOW_SECONDS` are folded into "
        "the existing event (`duplicate=true`); later reports create new events."
    ),
    status_code=status.HTTP_201_CREATED,
    response_model=ApiResponse[ViolationIngestResult],
    responses=error_responses(401, 404, 422),
)
async def ingest_violation(
    body: ViolationIngest, session: DbSession, settings: SettingsDep, response: Response
) -> ApiResponse[ViolationIngestResult]:
    service = ViolationIngestService(
        session, timedelta(seconds=settings.violation_dedup_window_seconds)
    )
    result = await service.ingest(body)
    if result.duplicate:
        response.status_code = status.HTTP_200_OK
    return ApiResponse(data=result)
