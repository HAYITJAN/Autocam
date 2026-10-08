"""Idempotent demo backfill: traffic counters, vehicle detections and evidence.

Each step runs only when its table is empty, so it completes databases seeded before
these tables were generated and is a no-op afterwards. Development/demo data only.
"""

import hashlib
import random
from datetime import datetime, timedelta, tzinfo
from typing import Any

from sqlalchemy import exists, insert, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Camera,
    TrafficStatsHourly,
    Vehicle,
    VehicleDetection,
    VehicleType,
    Violation,
    ViolationEvidence,
    ViolationType,
)
from app.models.enums import EvidenceType
from app.services import demo_media
from app.services.media import DEMO_STORAGE

# Share of the camera's peak hourly volume per local hour.
TRAFFIC_PROFILE = (
    0.18, 0.10, 0.07, 0.06, 0.08, 0.20, 0.50, 0.90, 1.00, 0.85, 0.70, 0.70,
    0.75, 0.75, 0.70, 0.72, 0.85, 1.00, 0.95, 0.80, 0.60, 0.45, 0.35, 0.25,
)  # fmt: skip
TRAFFIC_TYPE_SHARE = {"CAR": 0.82, "TRUCK": 0.06, "BUS": 0.05, "MOTORCYCLE": 0.03, "OTHER": 0.04}
TYPICAL_SPEED = {"CAR": 48.0, "TRUCK": 40.0, "BUS": 36.0, "MOTORCYCLE": 45.0, "OTHER": 42.0}
PEAK_VOLUME = (120, 480)
HOME_CAMERAS = 3
HOME_SHARE = 0.75
CONTEXT_OFFSET = timedelta(milliseconds=1200)
BATCH = 20_000


async def seed_demo_backfill(
    session: AsyncSession, *, rng: random.Random, now: datetime, days: int, tz: tzinfo
) -> dict[str, int]:
    return {
        "traffic_stats_hourly": await _seed_traffic(session, rng, now, days, tz),
        "vehicle_detections": await _seed_detections(session, rng, now, days, tz),
        "violation_evidence": await _seed_evidence(session, tz),
    }


async def _is_empty(session: AsyncSession, model: Any) -> bool:
    return not await session.scalar(select(exists().select_from(model)))


async def _insert_batched(session: AsyncSession, model: Any, rows: list[dict[str, Any]]) -> None:
    for start in range(0, len(rows), BATCH):
        await session.execute(insert(model), rows[start : start + BATCH])


async def _seed_traffic(
    session: AsyncSession, rng: random.Random, now: datetime, days: int, tz: tzinfo
) -> int:
    if not await _is_empty(session, TrafficStatsHourly):
        return 0
    cameras = list(await session.scalars(select(Camera.id).where(Camera.deleted_at.is_(None))))
    types = dict((await session.execute(select(VehicleType.code, VehicleType.id))).all())
    shares = {code: share for code, share in TRAFFIC_TYPE_SHARE.items() if code in types}
    if not cameras or not shares:
        return 0
    last_hour = now.replace(minute=0, second=0, microsecond=0)
    hours = [last_hour - timedelta(hours=h) for h in range(days * 24, -1, -1)]
    rows: list[dict[str, Any]] = []
    for camera_id in cameras:
        peak = rng.randint(*PEAK_VOLUME)
        for bucket in hours:
            local = bucket.astimezone(tz)
            weekend = 0.8 if local.weekday() >= 5 else 1.0
            volume = peak * TRAFFIC_PROFILE[local.hour] * weekend
            for code, share in shares.items():
                count = round(volume * share * rng.uniform(0.85, 1.15))
                if count <= 0:
                    continue
                speed = TYPICAL_SPEED[code] * rng.uniform(0.85, 1.15) * (1.15 - 0.3 * volume / peak)
                rows.append(
                    {
                        "camera_id": camera_id,
                        "hour_bucket": bucket,
                        "vehicle_type_id": types[code],
                        "vehicle_count": count,
                        "avg_speed_kmh": round(speed, 2),
                        "max_speed_kmh": round(speed + rng.uniform(15, 40), 2),
                    }
                )
    await _insert_batched(session, TrafficStatsHourly, rows)
    return len(rows)


async def _seed_detections(
    session: AsyncSession, rng: random.Random, now: datetime, days: int, tz: tzinfo
) -> int:
    if not await _is_empty(session, VehicleDetection):
        return 0
    cameras = list(await session.scalars(select(Camera.id).where(Camera.deleted_at.is_(None))))
    if not cameras:
        return 0
    violations = (
        await session.execute(
            select(
                Violation.vehicle_id,
                Violation.camera_id,
                Violation.occurred_at,
                Violation.plate_number,
                Violation.vehicle_type_id,
                Violation.detected_speed,
                Violation.track_id,
                Violation.ai_confidence,
            ).order_by(Violation.id)
        )
    ).all()
    vehicles = (
        await session.execute(
            select(
                Vehicle.id,
                Vehicle.plate_number,
                Vehicle.vehicle_type_id,
                Vehicle.total_detections,
                Vehicle.last_camera_id,
            ).order_by(Vehicle.id)
        )
    ).all()

    rows: list[dict[str, Any]] = []
    per_vehicle: dict[int, int] = {}
    for vehicle_id, camera_id, occurred, plate, type_id, speed, track, confidence in violations:
        if vehicle_id is not None:
            per_vehicle[vehicle_id] = per_vehicle.get(vehicle_id, 0) + 1
        rows.append(
            {
                "detected_at": occurred,
                "camera_id": camera_id,
                "vehicle_id": vehicle_id,
                "track_id": track or f"demo-v-{len(rows)}",
                "vehicle_type_id": type_id,
                "plate_text": plate,
                "plate_confidence": round(rng.uniform(0.86, 0.995), 4) if plate else None,
                "detection_confidence": max(confidence, 0.8),
                "speed_kmh": speed if speed is not None else round(rng.uniform(15, 60), 2),
            }
        )

    start = now - timedelta(days=days)
    span = (now - start).total_seconds()
    for vehicle_id, plate, type_id, total, last_camera in vehicles:
        home = rng.sample(cameras, k=min(HOME_CAMERAS, len(cameras)))
        if last_camera is not None:
            home.append(last_camera)
        for _ in range(max(total - per_vehicle.get(vehicle_id, 0), 0)):
            seen = _busy_moment(rng, start, span, tz)
            rows.append(
                {
                    "detected_at": seen,
                    "camera_id": rng.choice(home)
                    if rng.random() < HOME_SHARE
                    else rng.choice(cameras),
                    "vehicle_id": vehicle_id,
                    "track_id": f"demo-d-{len(rows)}",
                    "vehicle_type_id": type_id,
                    "plate_text": plate,
                    "plate_confidence": round(rng.uniform(0.86, 0.995), 4),
                    "detection_confidence": round(rng.uniform(0.8, 0.99), 4),
                    "speed_kmh": round(rng.uniform(25, 70), 2),
                }
            )
    rows.sort(key=lambda r: r["detected_at"])
    await _insert_batched(session, VehicleDetection, rows)

    # Keep the vehicle counters consistent with the detections they summarise.
    await session.execute(
        text(
            "UPDATE vehicles v SET total_detections = d.n, first_seen_at = d.first_at, "
            "last_seen_at = d.last_at FROM (SELECT vehicle_id, count(*) AS n, "
            "min(detected_at) AS first_at, max(detected_at) AS last_at FROM vehicle_detections "
            "WHERE vehicle_id IS NOT NULL GROUP BY vehicle_id) d WHERE v.id = d.vehicle_id"
        )
    )
    await session.execute(
        text(
            "UPDATE vehicles v SET last_camera_id = d.camera_id FROM (SELECT DISTINCT ON "
            "(vehicle_id) vehicle_id, camera_id FROM vehicle_detections WHERE vehicle_id IS NOT "
            "NULL ORDER BY vehicle_id, detected_at DESC) d WHERE v.id = d.vehicle_id"
        )
    )
    return len(rows)


def _busy_moment(rng: random.Random, start: datetime, span: float, tz: tzinfo) -> datetime:
    """Random moment in the window, biased towards busy local hours."""
    while True:
        moment = start + timedelta(seconds=rng.uniform(0, span))
        if rng.random() < TRAFFIC_PROFILE[moment.astimezone(tz).hour]:
            return moment


async def _seed_evidence(session: AsyncSession, tz: tzinfo) -> int:
    if not await _is_empty(session, ViolationEvidence):
        return 0
    rows = await session.execute(
        select(
            Violation.id,
            Violation.code,
            Violation.occurred_at,
            Violation.detected_speed,
            Violation.speed_limit,
            Violation.plate_number,
            ViolationType.code,
            ViolationType.name_uz,
            Camera.code,
            Camera.name,
            Vehicle.plate_display,
            Vehicle.brand,
            Vehicle.model,
            Vehicle.color,
            VehicleType.code,
        )
        .join(ViolationType, Violation.violation_type_id == ViolationType.id)
        .join(Camera, Violation.camera_id == Camera.id)
        .outerjoin(Vehicle, Violation.vehicle_id == Vehicle.id)
        .outerjoin(VehicleType, Violation.vehicle_type_id == VehicleType.id)
        .where(Violation.meta.contains({"demo": True}))
        .order_by(Violation.id)
    )
    evidence: list[dict[str, Any]] = []
    for (
        violation_id,
        code,
        occurred,
        speed,
        limit,
        plate,
        type_code,
        type_name,
        camera_code,
        camera_name,
        plate_display,
        brand,
        model,
        color,
        vehicle_type,
    ) in rows:
        scene = demo_media.DemoScene(
            violation_id=violation_id,
            violation_code=code,
            type_code=type_code,
            type_name=type_name,
            camera_code=camera_code,
            camera_name=camera_name,
            plate_display=plate_display,
            vehicle_label=demo_media.vehicle_label(brand, model),
            vehicle_color=color,
            vehicle_type=vehicle_type,
            detected_speed=speed,
            speed_limit=limit,
        )
        shots = [
            (EvidenceType.IMAGE_MAIN, occurred),
            (EvidenceType.VEHICLE_CROP, occurred),
            (EvidenceType.IMAGE_BEFORE, occurred - CONTEXT_OFFSET),
        ]
        if plate:
            shots.insert(2, (EvidenceType.PLATE_CROP, occurred))
        for evidence_type, captured in shots:
            body = demo_media.render(evidence_type, scene, captured, tz)
            width, height = demo_media.SIZES[evidence_type]
            evidence.append(
                {
                    "violation_id": violation_id,
                    "evidence_type": evidence_type,
                    "storage_backend": DEMO_STORAGE,
                    "storage_key": f"demo/{code}/{evidence_type.value.lower()}.svg",
                    "mime_type": demo_media.SVG_MIME,
                    "size_bytes": len(body),
                    "width": width,
                    "height": height,
                    "sha256": hashlib.sha256(body).hexdigest(),
                    "annotations": {"demo": True},
                    "captured_at": captured,
                }
            )
    await _insert_batched(session, ViolationEvidence, evidence)
    return len(evidence)
