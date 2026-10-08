from typing import Annotated

from fastapi import APIRouter, Query
from fastapi.responses import FileResponse, Response
from sqlalchemy import select

from app.api.deps import DbSession, MediaSignerDep, SettingsDep
from app.api.params import TzDep
from app.core.config import StorageBackend
from app.core.errors import AppError, ErrorCode, ForbiddenError, NotFoundError
from app.models import Camera, Vehicle, VehicleType, Violation, ViolationEvidence, ViolationType
from app.schemas.common import error_responses
from app.services import demo_media
from app.services.media import DEMO_STORAGE, MediaVariant, local_file

router = APIRouter(prefix="/media", tags=["Media"])

MEDIA_CSP = "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'"


@router.get(
    "/evidence/{evidence_id}",
    summary="Evidence file (signed URL)",
    description=(
        "Serves an evidence file. Authorised by the signature issued with the evidence "
        "metadata (`file_url`/`thumbnail_url`) instead of a bearer token, so it works in "
        "`<img>`/`<video>` tags; links expire after `MEDIA_URL_TTL_SECONDS`."
    ),
    response_class=Response,
    responses={
        200: {"content": {"image/jpeg": {}, "image/svg+xml": {}, "video/mp4": {}}},
        **error_responses(403, 404),
    },
)
async def evidence_file(
    evidence_id: int,
    session: DbSession,
    settings: SettingsDep,
    signer: MediaSignerDep,
    tz: TzDep,
    expires: int,
    signature: Annotated[str, Query(min_length=64, max_length=64)],
    variant: MediaVariant = MediaVariant.ORIGINAL,
) -> Response:
    if not signer.verify(evidence_id, variant, expires, signature):
        raise ForbiddenError("Media link is invalid or has expired")
    evidence = await session.get(ViolationEvidence, evidence_id)
    if evidence is None:
        raise NotFoundError("Evidence")
    headers = {
        "Cache-Control": f"private, max-age={settings.media_url_ttl_seconds}",
        "Content-Security-Policy": MEDIA_CSP,
    }

    if evidence.storage_backend == DEMO_STORAGE:
        if not settings.demo_mode or not demo_media.supported(evidence.evidence_type):
            raise NotFoundError("Evidence file")
        scene = await _demo_scene(session, evidence.violation_id)
        body = demo_media.render(evidence.evidence_type, scene, evidence.captured_at, tz)
        return Response(body, media_type=demo_media.SVG_MIME, headers=headers)

    if evidence.storage_backend == StorageBackend.LOCAL.value:
        path = local_file(settings.storage_path, evidence.storage_key)
        if path is None:
            raise NotFoundError("Evidence file")
        return FileResponse(path, media_type=evidence.mime_type, headers=headers)

    raise AppError(
        "Evidence storage backend is not available on this server",
        code=ErrorCode.SERVICE_UNAVAILABLE,
        status_code=503,
    )


async def _demo_scene(session: DbSession, violation_id: int) -> demo_media.DemoScene:
    row = (
        await session.execute(
            select(Violation, ViolationType, Camera, Vehicle, VehicleType)
            .join(ViolationType, Violation.violation_type_id == ViolationType.id)
            .join(Camera, Violation.camera_id == Camera.id)
            .outerjoin(Vehicle, Violation.vehicle_id == Vehicle.id)
            .outerjoin(VehicleType, Violation.vehicle_type_id == VehicleType.id)
            .where(Violation.id == violation_id)
        )
    ).one()
    violation, vtype, camera, vehicle, vehicle_type = row
    return demo_media.DemoScene(
        violation_id=violation.id,
        violation_code=violation.code,
        type_code=vtype.code,
        type_name=vtype.name_uz,
        camera_code=camera.code,
        camera_name=camera.name,
        plate_display=vehicle.plate_display if vehicle else None,
        vehicle_label=demo_media.vehicle_label(vehicle.brand, vehicle.model) if vehicle else None,
        vehicle_color=vehicle.color if vehicle else None,
        vehicle_type=vehicle_type.code if vehicle_type else None,
        detected_speed=violation.detected_speed,
        speed_limit=violation.speed_limit,
    )
