import time
from datetime import UTC, datetime

from fastapi import APIRouter, Request, status

from app.api.deps import HealthServiceDep, SettingsDep
from app.core.errors import ServiceUnavailableError
from app.schemas.common import ApiResponse, error_responses
from app.schemas.system import LivenessStatus, ReadinessState, ReadinessStatus

router = APIRouter(prefix="/system", tags=["System"])


@router.get(
    "/health",
    summary="Liveness probe",
    description=(
        "Confirms the API process is running. Does not touch external dependencies, "
        "so it is safe for frequent container health checks. **Authentication:** none."
    ),
    response_model=ApiResponse[LivenessStatus],
    status_code=status.HTTP_200_OK,
)
async def health(request: Request, settings: SettingsDep) -> ApiResponse[LivenessStatus]:
    started: float = request.app.state.started_monotonic
    return ApiResponse(
        data=LivenessStatus(
            app=settings.app_name,
            version=settings.app_version,
            environment=settings.app_env.value,
            demo_mode=settings.demo_mode,
            server_time=datetime.now(UTC),
            uptime_seconds=round(time.monotonic() - started, 1),
        )
    )


@router.get(
    "/ready",
    summary="Readiness probe",
    description=(
        "Checks PostgreSQL, Redis and the AI service. Returns `200` with status `ready` or "
        "`degraded` (only non-critical components down) and `503 SERVICE_UNAVAILABLE` when a "
        "critical dependency is unreachable; component states are returned in `error.details`. "
        "**Authentication:** none."
    ),
    response_model=ApiResponse[ReadinessStatus],
    status_code=status.HTTP_200_OK,
    responses=error_responses(status.HTTP_503_SERVICE_UNAVAILABLE),
)
async def ready(health_service: HealthServiceDep) -> ApiResponse[ReadinessStatus]:
    readiness = await health_service.readiness()
    if readiness.status is ReadinessState.NOT_READY:
        raise ServiceUnavailableError(
            "One or more critical dependencies are unavailable",
            details=[component.model_dump(mode="json") for component in readiness.components],
        )
    return ApiResponse(data=readiness)
