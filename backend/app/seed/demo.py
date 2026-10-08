"""Deterministic demo history (`seed_database --demo`). Development/demo databases only.

Generates vehicles, ~30 days of violations with a realistic daily/hourly profile, their
review timelines, camera status + health history and notifications. All rows are marked as
demo data (`metadata.demo = true` on violations) and nothing is generated when vehicles
already exist, so the command is safe to re-run.
"""

import random
from bisect import bisect_left
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, time, timedelta, timezone
from itertools import accumulate
from typing import Any

from sqlalchemy import func, insert, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Camera,
    CameraConnection,
    CameraHealthLog,
    Location,
    Notification,
    Role,
    SystemSetting,
    TrafficLight,
    User,
    Vehicle,
    VehicleType,
    Violation,
    ViolationEvent,
    ViolationType,
)
from app.models.enums import (
    CameraStatus,
    CameraType,
    ConnectionStatus,
    ConnectionType,
    NotificationState,
    NotificationType,
    Severity,
    TrafficLightState,
    VehicleStatus,
    ViolationEventType,
    ViolationStatus,
)
from app.seed.reference import ADMIN_ROLE

TASHKENT_TZ = timezone(timedelta(hours=5), "Asia/Tashkent")
PARTITIONED_TABLES = ("camera_health_logs", "vehicle_detections")

# Relative violation volume per local hour (morning and evening rush peaks).
HOURLY_WEIGHTS = (2, 1, 1, 1, 1, 2, 4, 8, 10, 8, 6, 6, 7, 7, 6, 6, 7, 9, 10, 8, 6, 5, 4, 3)
VIOLATION_TYPE_WEIGHTS = {
    "SPEEDING": 34,
    "RED_LIGHT": 28,
    "STOP_LINE": 16,
    "ILLEGAL_PARKING": 14,
    "WRONG_DIRECTION": 8,
}
VEHICLE_TYPE_WEIGHTS = {"CAR": 82, "TRUCK": 7, "BUS": 5, "MOTORCYCLE": 3, "OTHER": 3}
MODELS_BY_TYPE: dict[str, tuple[tuple[str, str], ...]] = {
    "CAR": (
        ("Chevrolet", "Cobalt"),
        ("Chevrolet", "Gentra"),
        ("Chevrolet", "Spark"),
        ("Chevrolet", "Malibu"),
        ("Chevrolet", "Nexia 3"),
        ("Chevrolet", "Tracker"),
        ("Chevrolet", "Onix"),
        ("BYD", "Song Plus"),
        ("BYD", "Chazor"),
        ("Kia", "K5"),
        ("Hyundai", "Sonata"),
        ("Toyota", "Camry"),
    ),
    "TRUCK": (("Isuzu", "NPR"), ("MAN", "TGS"), ("KAMAZ", "65115"), ("Chevrolet", "Labo")),
    "BUS": (("Isuzu", "Citiport"), ("Yutong", "ZK6118"), ("MAN", "Lion's City")),
    "MOTORCYCLE": (("Honda", "CB500"), ("Yamaha", "YBR125")),
    "OTHER": (("Chevrolet", "Damas"), ("Chevrolet", "Labo")),
}
COLORS = ("Oq", "Qora", "Kumush", "Kulrang", "Ko‘k", "Qizil", "Jigarrang")
REGION_WEIGHTS = {
    "01": 70,
    "10": 15,
    "20": 2,
    "25": 2,
    "30": 2,
    "40": 2,
    "50": 2,
    "60": 1,
    "70": 1,
    "75": 1,
    "80": 1,
    "90": 1,
}
PLATE_LETTERS = "ABCDEFGHJKLMNOPQRSTUVXYZ"
DIRECTIONS = ("NORTH", "SOUTH", "EAST", "WEST")
REJECTION_REASONS = (
    "Davlat raqami noto‘g‘ri o‘qilgan",
    "Maxsus xizmat transporti",
    "Svetofor nosoz bo‘lgan",
    "Tasvir sifati past",
)
PLATE_READ_RATE = 0.88
HEALTH_HISTORY_DAYS = 7


@dataclass(slots=True)
class _VehicleAgg:
    count: int = 0
    first: datetime | None = None
    last: datetime | None = None
    last_camera_id: int | None = None


@dataclass(slots=True)
class _CameraInfo:
    id: int
    code: str
    camera_type: CameraType
    location_id: int
    speed_limit: int
    has_light: bool


@dataclass(slots=True)
class DemoReport:
    created: dict[str, int] = field(default_factory=dict)
    skipped_reason: str | None = None


class _WeightedPicker[T]:
    def __init__(self, items: list[T], weights: list[float]) -> None:
        self._items = items
        self._cum = list(accumulate(weights))

    def pick(self, rng: random.Random) -> T:
        return self._items[bisect_left(self._cum, rng.random() * self._cum[-1])]


async def seed_demo(
    session: AsyncSession,
    *,
    rng: random.Random,
    now: datetime,
    days: int = 30,
    vehicle_count: int = 2000,
) -> DemoReport:
    report = DemoReport()
    if await session.scalar(select(func.count()).select_from(Vehicle)):
        report.skipped_reason = "vehicles already exist"
        return report

    await _ensure_partitions(session, now - timedelta(days=max(days, HEALTH_HISTORY_DAYS)), now)
    cameras = await _load_cameras(session)
    if not cameras:
        raise RuntimeError("Base seed must run before demo data (no cameras found)")
    vehicle_types = dict((await session.execute(select(VehicleType.code, VehicleType.id))).all())
    violation_types = {
        code: (type_id, severity, name)
        for code, type_id, severity, name in (
            await session.execute(
                select(
                    ViolationType.code,
                    ViolationType.id,
                    ViolationType.severity,
                    ViolationType.name_uz,
                ).where(ViolationType.is_active.is_(True))
            )
        )
    }
    users_by_role = await _load_users_by_role(session)
    reviewers = users_by_role.get("OPERATOR", []) + users_by_role.get("SUPERVISOR", [])
    reviewers = reviewers or users_by_role.get(ADMIN_ROLE, [])

    vehicles = _generate_vehicles(rng, vehicle_types, vehicle_count)
    specs = _generate_violations(
        rng,
        now=now,
        days=days,
        cameras=cameras,
        violation_types=violation_types,
        vehicle_count=len(vehicles),
        reviewers=reviewers,
    )

    aggs = [_VehicleAgg() for _ in vehicles]
    for spec in specs:
        index = spec["_vehicle_index"]
        if index is None:
            continue
        agg = aggs[index]
        agg.count += 1
        occurred: datetime = spec["occurred_at"]
        agg.first = min(agg.first or occurred, occurred)
        if agg.last is None or occurred >= agg.last:
            agg.last, agg.last_camera_id = occurred, spec["camera_id"]

    window_start = now - timedelta(days=days)
    for row, agg in zip(vehicles, aggs, strict=True):
        if agg.count:
            row.update(
                first_seen_at=agg.first, last_seen_at=agg.last, last_camera_id=agg.last_camera_id
            )
        else:
            seen = window_start + timedelta(
                seconds=rng.uniform(0, (now - window_start).total_seconds())
            )
            row.update(first_seen_at=seen, last_seen_at=seen, last_camera_id=rng.choice(cameras).id)
        row["total_violations"] = agg.count
        row["total_detections"] = agg.count * rng.randint(8, 25) + rng.randint(1, 30)

    vehicle_ids = list(
        await session.scalars(
            insert(Vehicle).returning(Vehicle.id, sort_by_parameter_order=True), vehicles
        )
    )
    report.created["vehicles"] = len(vehicle_ids)

    for spec in specs:
        index = spec.pop("_vehicle_index")
        spec["vehicle_id"] = vehicle_ids[index] if index is not None else None
        if index is not None:
            spec["vehicle_type_id"] = vehicles[index]["vehicle_type_id"]
            spec["plate_number"] = vehicles[index]["plate_number"]
    timelines = [spec.pop("_timeline") for spec in specs]
    inserted = list(
        (
            await session.execute(
                insert(Violation).returning(
                    Violation.id, Violation.code, sort_by_parameter_order=True
                ),
                specs,
            )
        ).all()
    )
    report.created["violations"] = len(inserted)

    events = [
        {**event, "violation_id": violation_id}
        for (violation_id, _), timeline in zip(inserted, timelines, strict=True)
        for event in timeline
    ]
    await session.execute(insert(ViolationEvent), events)
    report.created["violation_events"] = len(events)

    statuses = await _update_camera_status(session, rng, cameras, now)
    report.created["camera_health_logs"] = await _seed_health(session, rng, cameras, statuses, now)
    report.created["notifications"] = await _seed_notifications(
        session, specs, inserted, violation_types, cameras, statuses, users_by_role, now
    )
    await session.execute(
        update(SystemSetting).where(SystemSetting.key == "demo.enabled").values(value=True)
    )
    return report


async def _ensure_partitions(session: AsyncSession, start: datetime, end: datetime) -> None:
    month = date(start.year, start.month, 1)
    last = date(end.year, end.month, 1)
    while month <= last:
        for table in PARTITIONED_TABLES:
            await session.execute(
                text("SELECT ensure_monthly_partition(CAST(:parent AS regclass), :month)"),
                {"parent": table, "month": month},
            )
        month = date(month.year + month.month // 12, month.month % 12 + 1, 1)


async def _load_cameras(session: AsyncSession) -> list[_CameraInfo]:
    with_light = set(
        await session.scalars(
            select(TrafficLight.camera_id).where(TrafficLight.camera_id.is_not(None))
        )
    )
    rows = await session.execute(
        select(
            Camera.id, Camera.code, Camera.camera_type, Camera.location_id, Camera.speed_limit_kmh
        )
        .where(Camera.deleted_at.is_(None))
        .order_by(Camera.id)
    )
    return [
        _CameraInfo(cid, code, ctype, loc, limit, cid in with_light)
        for cid, code, ctype, loc, limit in rows
    ]


async def _load_users_by_role(session: AsyncSession) -> dict[str, list[int]]:
    rows = await session.execute(
        select(Role.code, User.id)
        .join(User, User.role_id == Role.id)
        .where(User.deleted_at.is_(None))
        .order_by(User.id)
    )
    result: dict[str, list[int]] = {}
    for role, user_id in rows:
        result.setdefault(role, []).append(user_id)
    return result


def _plate(rng: random.Random, region: _WeightedPicker[str]) -> tuple[str, str]:
    code = region.pick(rng)
    digits = f"{rng.randint(0, 999):03d}"
    if rng.random() < 0.8:
        first = rng.choice(PLATE_LETTERS)
        suffix = "".join(rng.choices(PLATE_LETTERS, k=2))
        return f"{code}{first}{digits}{suffix}", f"{code} {first} {digits} {suffix}"
    suffix = "".join(rng.choices(PLATE_LETTERS, k=3))
    return f"{code}{digits}{suffix}", f"{code} {digits} {suffix}"


def _generate_vehicles(
    rng: random.Random, vehicle_types: dict[str, int], count: int
) -> list[dict[str, Any]]:
    region = _WeightedPicker(list(REGION_WEIGHTS), [float(w) for w in REGION_WEIGHTS.values()])
    type_codes = [code for code in VEHICLE_TYPE_WEIGHTS if code in vehicle_types]
    type_picker = _WeightedPicker(type_codes, [float(VEHICLE_TYPE_WEIGHTS[c]) for c in type_codes])
    seen: set[str] = set()
    rows: list[dict[str, Any]] = []
    while len(rows) < count:
        plate, display = _plate(rng, region)
        if plate in seen:
            continue
        seen.add(plate)
        type_code = type_picker.pick(rng)
        brand, model = rng.choice(MODELS_BY_TYPE[type_code])
        roll = rng.random()
        status, reason = VehicleStatus.NORMAL, None
        if roll < 0.01:
            status, reason = VehicleStatus.BLACKLIST, "Qidiruvdagi transport vositasi (demo)"
        elif roll < 0.04:
            status, reason = VehicleStatus.WATCHLIST, "Ko‘p marta qoidabuzarlik (demo)"
        rows.append(
            {
                "plate_number": plate,
                "plate_display": display,
                "vehicle_type_id": vehicle_types[type_code],
                "brand": brand,
                "model": model,
                "color": rng.choice(COLORS),
                "status": status,
                "status_reason": reason,
            }
        )
    return rows


def _pick_status(rng: random.Random, age: timedelta) -> ViolationStatus:
    hours = age.total_seconds() / 3600
    if hours < 6:
        options = {
            ViolationStatus.NEW: 70,
            ViolationStatus.UNDER_REVIEW: 25,
            ViolationStatus.CONFIRMED: 5,
        }
    elif hours < 72:
        options = {
            ViolationStatus.NEW: 20,
            ViolationStatus.UNDER_REVIEW: 30,
            ViolationStatus.CONFIRMED: 40,
            ViolationStatus.REJECTED: 10,
        }
    else:
        options = {
            ViolationStatus.CONFIRMED: 72,
            ViolationStatus.REJECTED: 14,
            ViolationStatus.ARCHIVED: 8,
            ViolationStatus.UNDER_REVIEW: 6,
        }
    return rng.choices(list(options), weights=list(options.values()))[0]


def _status_event(
    at: datetime,
    actor: int | None,
    from_status: ViolationStatus,
    to_status: ViolationStatus,
    comment: str | None = None,
) -> dict[str, Any]:
    return {
        "event_type": ViolationEventType.STATUS_CHANGED,
        "from_status": from_status,
        "to_status": to_status,
        "actor_id": actor,
        "comment": comment,
        "created_at": at,
        "payload": {"demo": True},
    }


def _generate_violations(
    rng: random.Random,
    *,
    now: datetime,
    days: int,
    cameras: list[_CameraInfo],
    violation_types: dict[str, tuple[int, Severity, str]],
    vehicle_count: int,
    reviewers: list[int],
) -> list[dict[str, Any]]:
    type_codes = [code for code in VIOLATION_TYPE_WEIGHTS if code in violation_types]
    type_picker = _WeightedPicker(
        type_codes, [float(VIOLATION_TYPE_WEIGHTS[c]) for c in type_codes]
    )
    hotness = [rng.uniform(0.4, 2.0) for _ in cameras]
    pools = {
        "SPEEDING": [
            i for i, c in enumerate(cameras) if c.camera_type in {CameraType.SPEED, CameraType.ANPR}
        ],
        "RED_LIGHT": [i for i, c in enumerate(cameras) if c.has_light],
        "STOP_LINE": [i for i, c in enumerate(cameras) if c.has_light],
    }
    all_cams = list(range(len(cameras)))
    camera_pickers = {
        code: _WeightedPicker(pool or all_cams, [hotness[i] for i in (pool or all_cams)])
        for code, pool in {**pools, "_": all_cams}.items()
    }
    # Capped Pareto weights: a few repeat offenders and a long tail of one-off violators.
    offender = _WeightedPicker(
        list(range(vehicle_count)),
        [min(rng.paretovariate(2.0), 20.0) for _ in range(vehicle_count)],
    )

    now_local = now.astimezone(TASHKENT_TZ)
    window_start = now - timedelta(days=days)
    specs: list[dict[str, Any]] = []
    for day_offset in range(days, -1, -1):
        day = now_local.date() - timedelta(days=day_offset)
        volume = rng.randint(150, 230) * (0.8 if day.weekday() >= 5 else 1.0)
        for _ in range(round(volume)):
            hour = rng.choices(range(24), weights=HOURLY_WEIGHTS)[0]
            occurred = datetime.combine(
                day, time(hour, rng.randint(0, 59), rng.randint(0, 59)), TASHKENT_TZ
            ).astimezone(UTC)
            if not window_start <= occurred <= now:
                continue
            type_code = type_picker.pick(rng)
            camera = cameras[camera_pickers.get(type_code, camera_pickers["_"]).pick(rng)]
            specs.append(
                _violation_spec(
                    rng,
                    now,
                    occurred,
                    type_code,
                    violation_types[type_code][0],
                    camera,
                    offender.pick(rng) if rng.random() < PLATE_READ_RATE else None,
                    reviewers,
                    len(specs),
                )
            )
    specs.sort(key=lambda s: s["occurred_at"])
    return specs


def _violation_spec(
    rng: random.Random,
    now: datetime,
    occurred: datetime,
    type_code: str,
    type_id: int,
    camera: _CameraInfo,
    vehicle_index: int | None,
    reviewers: list[int],
    sequence: int,
) -> dict[str, Any]:
    status = _pick_status(rng, now - occurred)
    reviewer = rng.choice(reviewers) if reviewers else None
    created = occurred + timedelta(seconds=rng.randint(1, 5))
    timeline: list[dict[str, Any]] = [
        {
            **_status_event(created, None, ViolationStatus.NEW, ViolationStatus.NEW),
            "event_type": ViolationEventType.CREATED,
            "from_status": None,
            "payload": {"source": "ai", "demo": True},
        }
    ]
    reviewed_at: datetime | None = None
    if status is not ViolationStatus.NEW:
        started = min(created + timedelta(minutes=rng.randint(2, 90)), now)
        timeline.append(
            _status_event(started, reviewer, ViolationStatus.NEW, ViolationStatus.UNDER_REVIEW)
        )
        if status is not ViolationStatus.UNDER_REVIEW:
            reviewed_at = min(started + timedelta(minutes=rng.randint(1, 240)), now)
            final = (
                ViolationStatus.REJECTED
                if status is ViolationStatus.REJECTED
                else ViolationStatus.CONFIRMED
            )
            reason = rng.choice(REJECTION_REASONS) if final is ViolationStatus.REJECTED else None
            timeline.append(
                _status_event(reviewed_at, reviewer, ViolationStatus.UNDER_REVIEW, final, reason)
            )
            if status is ViolationStatus.ARCHIVED:
                archived = min(reviewed_at + timedelta(days=rng.randint(1, 3)), now)
                timeline.append(_status_event(archived, reviewer, final, ViolationStatus.ARCHIVED))

    spec: dict[str, Any] = {
        "violation_type_id": type_id,
        "camera_id": camera.id,
        "location_id": camera.location_id,
        "vehicle_id": None,
        "vehicle_type_id": None,
        "plate_number": None,
        "detected_speed": None,
        "speed_limit": None,
        "excess_speed": None,
        "traffic_light_state": None,
        "track_id": f"demo-{camera.code}-{sequence}",
        "status": status,
        "ai_confidence": round(0.6 + 0.39 * rng.betavariate(5, 2), 4),
        "direction": rng.choice(DIRECTIONS),
        "occurred_at": occurred,
        "assigned_to": reviewer if status is ViolationStatus.UNDER_REVIEW else None,
        "reviewed_by": reviewer if reviewed_at else None,
        "reviewed_at": reviewed_at,
        "rejection_reason": timeline[-1]["comment"] if status is ViolationStatus.REJECTED else None,
        "meta": {"demo": True},
        "_vehicle_index": vehicle_index,
        "_timeline": timeline,
    }
    if type_code == "SPEEDING":
        limit = float(camera.speed_limit)
        detected = round(limit + 10 + rng.uniform(1, 45), 1)
        spec.update(
            detected_speed=detected, speed_limit=limit, excess_speed=round(detected - limit, 1)
        )
    if type_code in {"RED_LIGHT", "STOP_LINE"}:
        spec["traffic_light_state"] = TrafficLightState.RED
    return spec


async def _update_camera_status(
    session: AsyncSession, rng: random.Random, cameras: list[_CameraInfo], now: datetime
) -> dict[int, CameraStatus]:
    statuses = {c.id: CameraStatus.ONLINE for c in cameras}
    unhealthy = rng.sample(cameras, k=min(4, len(cameras)))
    for camera in unhealthy[:3]:
        statuses[camera.id] = CameraStatus.WARNING
    for camera in unhealthy[3:]:
        statuses[camera.id] = CameraStatus.OFFLINE

    await session.execute(
        update(Camera),
        [
            {
                "id": c.id,
                "status": statuses[c.id],
                "installed_at": now - timedelta(days=rng.randint(90, 900)),
                "last_heartbeat_at": now
                - timedelta(
                    minutes=rng.randint(10, 120) if statuses[c.id] is CameraStatus.OFFLINE else 0,
                    seconds=rng.randint(0, 4),
                ),
            }
            for c in cameras
        ],
    )
    connections = await session.execute(
        select(CameraConnection.id, CameraConnection.camera_id, CameraConnection.connection_type)
    )
    link_state = {
        CameraStatus.ONLINE: ConnectionStatus.CONNECTED,
        CameraStatus.WARNING: ConnectionStatus.DEGRADED,
        CameraStatus.OFFLINE: ConnectionStatus.DISCONNECTED,
    }
    await session.execute(
        update(CameraConnection),
        [
            {
                "id": conn_id,
                "status": link_state[statuses.get(camera_id, CameraStatus.OFFLINE)],
                "signal_strength_dbm": None
                if kind is ConnectionType.ETHERNET
                else rng.randint(-88, -55),
            }
            for conn_id, camera_id, kind in connections
        ],
    )
    return statuses


async def _seed_health(
    session: AsyncSession,
    rng: random.Random,
    cameras: list[_CameraInfo],
    statuses: dict[int, CameraStatus],
    now: datetime,
) -> int:
    end = now.replace(minute=0, second=0, microsecond=0)
    rows: list[dict[str, Any]] = []
    for camera in cameras:
        current = statuses[camera.id]
        for hours_ago in range(HEALTH_HISTORY_DAYS * 24, -1, -1):
            status = (
                current
                if hours_ago < 2
                else (CameraStatus.WARNING if rng.random() < 0.02 else CameraStatus.ONLINE)
            )
            if status is CameraStatus.OFFLINE:
                continue
            degraded = status is CameraStatus.WARNING
            rows.append(
                {
                    "camera_id": camera.id,
                    "recorded_at": end - timedelta(hours=hours_ago),
                    "status": status,
                    "fps": round(rng.uniform(8, 14) if degraded else rng.uniform(23.5, 25.0), 2),
                    "latency_ms": rng.randint(350, 900) if degraded else rng.randint(35, 140),
                    "cpu_percent": round(rng.uniform(20, 65), 2),
                    "temperature_c": round(rng.uniform(36, 58), 2),
                    "signal_strength_dbm": rng.randint(-88, -55),
                    "packet_loss_pct": round(
                        rng.uniform(4, 12) if degraded else rng.uniform(0, 1.5), 2
                    ),
                    "uptime_seconds": (HEALTH_HISTORY_DAYS * 24 - hours_ago) * 3600
                    + rng.randint(0, 3599),
                }
            )
    await session.execute(insert(CameraHealthLog), rows)
    return len(rows)


async def _seed_notifications(
    session: AsyncSession,
    specs: list[dict[str, Any]],
    inserted: Sequence[tuple[int, str]],
    violation_types: dict[str, tuple[int, Severity, str]],
    cameras: list[_CameraInfo],
    statuses: dict[int, CameraStatus],
    users_by_role: dict[str, list[int]],
    now: datetime,
) -> int:
    recipients = [
        user_id
        for role in (ADMIN_ROLE, "SUPERVISOR", "OPERATOR")
        for user_id in users_by_role.get(role, [])
    ]
    if not recipients:
        return 0
    types_by_id = {
        type_id: (severity, name) for type_id, severity, name in violation_types.values()
    }
    location_names = dict((await session.execute(select(Location.id, Location.name))).all())
    camera_codes = {c.id: c.code for c in cameras}

    alerts: list[dict[str, Any]] = []
    serious = [
        (spec, row)
        for spec, row in zip(specs, inserted, strict=True)
        if types_by_id[spec["violation_type_id"]][0] in {Severity.HIGH, Severity.CRITICAL}
    ][-25:]
    for spec, (violation_id, code) in serious:
        severity, name = types_by_id[spec["violation_type_id"]]
        alerts.append(
            {
                "type": NotificationType.VIOLATION,
                "category": "NEW_VIOLATION",
                "title": f"{name} — {camera_codes[spec['camera_id']]}",
                "message": (
                    f"{spec.get('plate_number') or 'Raqam aniqlanmagan'} • "
                    f"{location_names.get(spec['location_id'], '')}"
                ),
                "entity_type": "violation",
                "entity_id": str(violation_id),
                "link": f"/violations/{violation_id}",
                "payload": {"code": code, "severity": severity.value, "demo": True},
                "created_at": spec["occurred_at"],
            }
        )
    for camera in cameras:
        status = statuses[camera.id]
        if status is CameraStatus.ONLINE:
            continue
        offline = status is CameraStatus.OFFLINE
        alerts.append(
            {
                "type": NotificationType.CRITICAL if offline else NotificationType.WARNING,
                "category": "CAMERA_OFFLINE" if offline else "CAMERA_WARNING",
                "title": f"{camera.code} {'aloqada emas' if offline else 'beqaror ishlayapti'}",
                "message": location_names.get(camera.location_id, ""),
                "entity_type": "camera",
                "entity_id": str(camera.id),
                "link": f"/cameras/{camera.id}",
                "payload": {"status": status.value, "demo": True},
                "created_at": now - timedelta(minutes=15),
            }
        )

    rows = [
        {
            **alert,
            "user_id": user_id,
            "state": (
                NotificationState.READ
                if now - alert["created_at"] > timedelta(hours=12)
                else NotificationState.UNREAD
            ),
            "read_at": (
                alert["created_at"] + timedelta(minutes=30)
                if now - alert["created_at"] > timedelta(hours=12)
                else None
            ),
        }
        for user_id in recipients
        for alert in alerts
    ]
    await session.execute(insert(Notification), rows)
    return len(rows)
