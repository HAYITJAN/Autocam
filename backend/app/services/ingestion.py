"""Turns AI detections into violation events, folding duplicate reports.

A report is a duplicate of an existing event when camera, violation type and vehicle
(plate, or track id when the plate was not read) match and the two moments are closer
than `violation_dedup_window_seconds`. Reports further apart are separate events even
for the same vehicle, so genuine repeat violations are never lost.
"""

from datetime import UTC, datetime, timedelta

from sqlalchemy import case, extract, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError, ErrorCode, NotFoundError
from app.models import Camera, Vehicle, VehicleType, Violation, ViolationEvent, ViolationType
from app.models.enums import ViolationEventType, ViolationStatus
from app.schemas.ingestion import ViolationIngest, ViolationIngestResult
from app.services.violations import normalize_plate


class ViolationIngestService:
    def __init__(self, session: AsyncSession, dedup_window: timedelta) -> None:
        self.session = session
        self.dedup_window = dedup_window

    async def ingest(self, data: ViolationIngest) -> ViolationIngestResult:
        if data.idempotency_key and (existing := await self._by_key(data.idempotency_key)):
            return _result(existing, duplicate=True)
        try:
            return await self._ingest(data)
        except IntegrityError:
            # A concurrent request with the same idempotency key won the race.
            await self.session.rollback()
            if data.idempotency_key and (existing := await self._by_key(data.idempotency_key)):
                return _result(existing, duplicate=True)
            raise

    async def _ingest(self, data: ViolationIngest) -> ViolationIngestResult:
        camera = await self.session.scalar(
            select(Camera).where(
                Camera.code == data.camera_code.strip().upper(), Camera.deleted_at.is_(None)
            )
        )
        if camera is None:
            raise NotFoundError("Camera")
        vtype = await self.session.scalar(
            select(ViolationType).where(ViolationType.code == data.violation_type.strip().upper())
        )
        if vtype is None:
            raise NotFoundError("Violation type")
        if not vtype.is_active:
            raise AppError(
                f"Violation type {vtype.code} is disabled",
                code=ErrorCode.VALIDATION_ERROR,
                status_code=422,
            )

        occurred = (
            data.occurred_at if data.occurred_at.tzinfo else data.occurred_at.replace(tzinfo=UTC)
        )
        plate = normalize_plate(data.plate_number or "") or None
        identity = plate or f"track:{data.track_id}"
        await self.session.execute(
            select(
                func.pg_advisory_xact_lock(
                    func.hashtextextended(f"violation:{camera.id}:{vtype.id}:{identity}", 0)
                )
            )
        )

        duplicate = await self._find_duplicate(camera.id, vtype.id, plate, data.track_id, occurred)
        if duplicate is not None:
            duplicate.duplicate_count += 1
            duplicate.ai_confidence = max(duplicate.ai_confidence, data.ai_confidence)
            duplicate.meta = {**duplicate.meta, "last_duplicate_at": occurred.isoformat()}
            await self.session.commit()
            return _result(duplicate, duplicate=True)

        vehicle_type_id = (
            await self.session.scalar(
                select(VehicleType.id).where(VehicleType.code == data.vehicle_type.upper())
            )
            if data.vehicle_type
            else None
        )
        vehicle_id = None
        if plate:
            vehicle_id, vehicle_type_id = await self._upsert_vehicle(
                data, plate, vehicle_type_id, camera.id, occurred
            )

        excess = (
            round(data.detected_speed - data.speed_limit, 2)
            if data.detected_speed is not None
            and data.speed_limit is not None
            and data.detected_speed > data.speed_limit
            else None
        )
        violation = Violation(
            violation_type_id=vtype.id,
            camera_id=camera.id,
            location_id=camera.location_id,
            vehicle_id=vehicle_id,
            vehicle_type_id=vehicle_type_id,
            plate_number=plate,
            track_id=data.track_id,
            status=ViolationStatus.NEW,
            ai_confidence=data.ai_confidence,
            detected_speed=data.detected_speed,
            speed_limit=data.speed_limit,
            excess_speed=excess,
            direction=data.direction.upper() if data.direction else None,
            traffic_light_state=data.traffic_light_state,
            occurred_at=occurred,
            idempotency_key=data.idempotency_key,
            meta={**data.metadata, "source": "ai"},
        )
        self.session.add(violation)
        await self.session.flush()
        self.session.add(
            ViolationEvent(
                violation_id=violation.id,
                event_type=ViolationEventType.CREATED,
                to_status=ViolationStatus.NEW,
                payload={"source": "ai"},
            )
        )
        await self.session.commit()
        await self.session.refresh(violation)
        return _result(violation, duplicate=False)

    async def _by_key(self, key: str) -> Violation | None:
        return await self.session.scalar(select(Violation).where(Violation.idempotency_key == key))

    async def _find_duplicate(
        self,
        camera_id: int,
        type_id: int,
        plate: str | None,
        track_id: str | None,
        occurred: datetime,
    ) -> Violation | None:
        same_vehicle = (
            Violation.plate_number == plate
            if plate
            else (Violation.plate_number.is_(None) & (Violation.track_id == track_id))
        )
        return await self.session.scalar(
            select(Violation)
            .where(
                Violation.camera_id == camera_id,
                Violation.violation_type_id == type_id,
                same_vehicle,
                Violation.occurred_at >= occurred - self.dedup_window,
                Violation.occurred_at <= occurred + self.dedup_window,
            )
            .order_by(func.abs(extract("epoch", Violation.occurred_at - occurred)))
            .limit(1)
            .with_for_update()
        )

    async def _upsert_vehicle(
        self,
        data: ViolationIngest,
        plate: str,
        vehicle_type_id: int | None,
        camera_id: int,
        occurred: datetime,
    ) -> tuple[int, int | None]:
        values = insert(Vehicle).values(
            plate_number=plate,
            plate_display=(data.plate_display or plate)[:20],
            vehicle_type_id=vehicle_type_id,
            brand=data.brand,
            model=data.model,
            color=data.color,
            first_seen_at=occurred,
            last_seen_at=occurred,
            last_camera_id=camera_id,
            total_violations=1,
        )
        newer = Vehicle.last_seen_at.is_(None) | (Vehicle.last_seen_at < occurred)
        stmt = values.on_conflict_do_update(
            index_elements=[Vehicle.plate_number],
            set_={
                "total_violations": Vehicle.total_violations + 1,
                "first_seen_at": func.least(Vehicle.first_seen_at, occurred),
                "last_seen_at": func.greatest(Vehicle.last_seen_at, occurred),
                "last_camera_id": case((newer, camera_id), else_=Vehicle.last_camera_id),
                "vehicle_type_id": func.coalesce(Vehicle.vehicle_type_id, vehicle_type_id),
                "brand": func.coalesce(Vehicle.brand, data.brand),
                "model": func.coalesce(Vehicle.model, data.model),
                "color": func.coalesce(Vehicle.color, data.color),
                "updated_at": func.now(),
            },
        ).returning(Vehicle.id, Vehicle.vehicle_type_id)
        vehicle_id, type_id = (await self.session.execute(stmt)).one()
        return vehicle_id, type_id


def _result(violation: Violation, *, duplicate: bool) -> ViolationIngestResult:
    return ViolationIngestResult(
        id=violation.id,
        code=violation.code,
        duplicate=duplicate,
        duplicate_count=violation.duplicate_count,
    )
