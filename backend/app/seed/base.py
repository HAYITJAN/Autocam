"""Idempotent base seed: reference data, camera network and the initial administrator.

Re-running only inserts what is missing. Existing rows (including admin edits to roles,
settings or cameras) are never overwritten; permission metadata is the only thing updated.
"""

import secrets
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models import (
    AIModel,
    Camera,
    CameraConnection,
    District,
    Location,
    Permission,
    Role,
    SystemSetting,
    TrafficLight,
    TrafficZone,
    User,
    VehicleType,
    ViolationType,
    role_permissions,
)
from app.models.enums import (
    AIModelTask,
    CameraType,
    ConnectionType,
    LocationType,
    TrafficLightSource,
    ZoneType,
)
from app.seed import reference as ref

LTE_OPERATORS = ("Ucell", "Beeline", "Mobiuz", "Uzmobile")
CAMERA_DIRECTIONS = ("asosiy yo‘nalish", "qarama-qarshi yo‘nalish")
MIN_PASSWORD_LENGTH = 12


@dataclass(slots=True)
class UserSeed:
    username: str
    email: str
    full_name: str
    role: str
    password: str | None = None


@dataclass(slots=True)
class SeedReport:
    created: dict[str, int] = field(default_factory=dict)
    generated_passwords: dict[str, str] = field(default_factory=dict)

    def add(self, key: str, count: int) -> None:
        self.created[key] = self.created.get(key, 0) + count


def camera_code(index: int) -> str:
    return f"CAM-{index + 1:03d}"


async def seed_base(
    session: AsyncSession, *, users: list[UserSeed], allow_generated_passwords: bool
) -> SeedReport:
    report = SeedReport()
    await _seed_permissions_and_roles(session, report)
    district_ids = await _seed_districts(session, report)
    location_ids = await _seed_locations(session, district_ids, report)
    await _seed_types(session, report)
    vehicle_model_id = await _seed_ai_models(session, report)
    await _seed_cameras(session, location_ids, vehicle_model_id, report)
    await _seed_settings(session, report)
    await _seed_users(session, users, allow_generated_passwords, report)
    return report


async def _seed_permissions_and_roles(session: AsyncSession, report: SeedReport) -> None:
    existing_perms = set(await session.scalars(select(Permission.code)))
    stmt = insert(Permission).values(
        [{"code": code, "module": module, "name": name} for code, module, name in ref.PERMISSIONS]
    )
    await session.execute(
        stmt.on_conflict_do_update(
            index_elements=[Permission.code],
            set_={"module": stmt.excluded.module, "name": stmt.excluded.name},
        )
    )
    new_perms = {code for code, _, _ in ref.PERMISSIONS} - existing_perms
    report.add("permissions", len(new_perms))

    existing_roles = set(await session.scalars(select(Role.code)))
    new_roles = [role for role in ref.ROLES if role[0] not in existing_roles]
    if new_roles:
        await session.execute(
            insert(Role).values(
                [
                    {"code": code, "name": name, "description": desc, "is_system": True}
                    for code, name, desc in new_roles
                ]
            )
        )
    report.add("roles", len(new_roles))
    new_role_codes = {code for code, _, _ in new_roles}

    perm_ids = dict((await session.execute(select(Permission.code, Permission.id))).all())
    role_ids = dict((await session.execute(select(Role.code, Role.id))).all())
    # Grant the default matrix only for roles/permissions introduced by this run, so that
    # permissions an administrator revoked are not silently re-granted. The administrator
    # role always holds every permission.
    grants = [
        {"role_id": role_ids[role], "permission_id": perm_ids[perm]}
        for role, perms in ref.ROLE_PERMISSIONS.items()
        if role in role_ids
        for perm in perms
        if role == ref.ADMIN_ROLE or role in new_role_codes or perm in new_perms
    ]
    if grants:
        await session.execute(insert(role_permissions).values(grants).on_conflict_do_nothing())


async def _seed_districts(session: AsyncSession, report: SeedReport) -> dict[str, int]:
    result = await session.execute(
        insert(District)
        .values(
            [
                {"code": d.code, "name": d.name, "center_lat": d.lat, "center_lng": d.lng}
                for d in ref.DISTRICTS
            ]
        )
        .on_conflict_do_nothing(index_elements=[District.code])
        .returning(District.id)
    )
    report.add("districts", len(result.all()))
    return dict((await session.execute(select(District.code, District.id))).all())


async def _seed_locations(
    session: AsyncSession, district_ids: dict[str, int], report: SeedReport
) -> list[int]:
    rows = (await session.execute(select(Location.district_id, Location.name, Location.id))).all()
    existing = {(district_id, name): loc_id for district_id, name, loc_id in rows}
    ids: list[int] = []
    for seed in ref.LOCATIONS:
        key = (district_ids[seed.district], seed.name)
        if key not in existing:
            location = Location(
                district_id=key[0],
                name=seed.name,
                address=seed.address or f"Toshkent sh., {seed.name}",
                location_type=seed.location_type,
                latitude=seed.lat,
                longitude=seed.lng,
            )
            session.add(location)
            await session.flush()
            existing[key] = location.id
            report.add("locations", 1)
        ids.append(existing[key])
    return ids


async def _seed_types(session: AsyncSession, report: SeedReport) -> None:
    result = await session.execute(
        insert(VehicleType)
        .values(
            [
                {"code": code, "name_uz": uz, "name_en": en, "color": color, "icon": icon}
                for code, uz, en, color, icon in ref.VEHICLE_TYPES
            ]
        )
        .on_conflict_do_nothing(index_elements=[VehicleType.code])
        .returning(VehicleType.id)
    )
    report.add("vehicle_types", len(result.all()))

    result = await session.execute(
        insert(ViolationType)
        .values(
            [
                {
                    "code": v.code,
                    "name_uz": v.name_uz,
                    "name_en": v.name_en,
                    "description": v.description,
                    "severity": v.severity,
                    "color": v.color,
                    "icon": v.icon,
                    "rule_params": v.rule_params,
                    "is_active": v.is_active,
                }
                for v in ref.VIOLATION_TYPES
            ]
        )
        .on_conflict_do_nothing(index_elements=[ViolationType.code])
        .returning(ViolationType.id)
    )
    report.add("violation_types", len(result.all()))
    # Types created before descriptions existed get the reference text once; admin edits stay.
    for v in ref.VIOLATION_TYPES:
        if v.description:
            await session.execute(
                update(ViolationType)
                .where(ViolationType.code == v.code, ViolationType.description.is_(None))
                .values(description=v.description)
            )


async def _seed_ai_models(session: AsyncSession, report: SeedReport) -> int | None:
    result = await session.execute(
        insert(AIModel)
        .values(
            [
                {
                    "name": m.name,
                    "version": m.version,
                    "framework": m.framework,
                    "task": m.task,
                    "weights_uri": m.weights_uri,
                    "description": m.description,
                    "is_active": m.is_active,
                }
                for m in ref.AI_MODELS
            ]
        )
        .on_conflict_do_nothing(index_elements=[AIModel.name, AIModel.version])
        .returning(AIModel.id)
    )
    report.add("ai_models", len(result.all()))
    return await session.scalar(
        select(AIModel.id)
        .where(AIModel.task == AIModelTask.VEHICLE_DETECTION, AIModel.is_active.is_(True))
        .order_by(AIModel.id)
        .limit(1)
    )


def _camera_type(index: int, location_type: LocationType) -> CameraType:
    if location_type is LocationType.HIGHWAY or index % 5 == 4:
        return CameraType.SPEED
    return (CameraType.ANPR, CameraType.FIXED, CameraType.PTZ)[index % 3]


def _connection(index: int, district_code: str) -> CameraConnection:
    kind = (ConnectionType.ETHERNET, ConnectionType.LTE_4G, ConnectionType.WIFI)[index % 3]
    return CameraConnection(
        connection_type=kind,
        is_primary=True,
        operator=LTE_OPERATORS[index % len(LTE_OPERATORS)]
        if kind is ConnectionType.LTE_4G
        else None,
        ssid_or_apn=(
            f"ST-NET-{district_code}"
            if kind is ConnectionType.WIFI
            else "internet"
            if kind is ConnectionType.LTE_4G
            else None
        ),
        ip_address=f"10.30.{index // 200}.{10 + index % 200}",
        bandwidth_mbps={ConnectionType.ETHERNET: 100.0, ConnectionType.LTE_4G: 20.0}.get(
            kind, 50.0
        ),
    )


def _polygon(points: list[list[float]]) -> dict[str, Any]:
    return {"type": "polygon", "points": points}


def _line(points: list[list[float]]) -> dict[str, Any]:
    return {"type": "line", "points": points}


def _zones(
    camera_id: int, camera_type: CameraType, location: ref.LocationSeed, direction: float
) -> list[TrafficZone]:
    zones = [
        TrafficZone(
            camera_id=camera_id,
            name="Aniqlash hududi",
            zone_type=ZoneType.DETECTION_AREA,
            geometry=_polygon([[0.02, 0.30], [0.98, 0.30], [0.98, 0.98], [0.02, 0.98]]),
        ),
        TrafficZone(
            camera_id=camera_id,
            name="Harakat yo‘nalishi",
            zone_type=ZoneType.LANE_DIRECTION,
            geometry=_polygon([[0.25, 0.30], [0.75, 0.30], [0.90, 0.98], [0.10, 0.98]]),
            config={"expected_direction_deg": direction, "tolerance_deg": 60},
        ),
    ]
    if location.location_type is LocationType.INTERSECTION:
        zones.append(
            TrafficZone(
                camera_id=camera_id,
                name="To‘xtash chizig‘i",
                zone_type=ZoneType.STOP_LINE,
                geometry=_line([[0.10, 0.62], [0.90, 0.62]]),
            )
        )
    if camera_type is CameraType.SPEED:
        zones.append(
            TrafficZone(
                camera_id=camera_id,
                name="Tezlik o‘lchash oralig‘i",
                zone_type=ZoneType.SPEED_TRAP,
                geometry={
                    "type": "lines",
                    "entry": [[0.10, 0.45], [0.90, 0.45]],
                    "exit": [[0.05, 0.85], [0.95, 0.85]],
                },
                config={"distance_m": 20},
            )
        )
    if location.location_type is LocationType.STREET:
        zones.append(
            TrafficZone(
                camera_id=camera_id,
                name="To‘xtash taqiqlangan joy",
                zone_type=ZoneType.PARKING_RESTRICTED,
                geometry=_polygon([[0.70, 0.55], [0.98, 0.55], [0.98, 0.95], [0.80, 0.95]]),
                config={"dwell_seconds": 60},
            )
        )
    return zones


async def _seed_cameras(
    session: AsyncSession,
    location_ids: list[int],
    ai_model_id: int | None,
    report: SeedReport,
) -> None:
    existing = set(await session.scalars(select(Camera.code)))
    for index in range(ref.CAMERA_COUNT):
        code = camera_code(index)
        if code in existing:
            continue
        slot = index % len(ref.LOCATIONS)
        location = ref.LOCATIONS[slot]
        camera_type = _camera_type(index, location.location_type)
        direction = float((index * 37) % 360)
        camera = Camera(
            code=code,
            name=f"{location.name} ({CAMERA_DIRECTIONS[index // len(ref.LOCATIONS) % 2]})",
            location_id=location_ids[slot],
            camera_type=camera_type,
            ip_address=f"10.20.{index // 200}.{10 + index % 200}",
            port=554,
            mac_address="02:5A:" + ":".join(f"{b:02X}" for b in index.to_bytes(4, "big")),
            ai_model_id=ai_model_id,
            speed_limit_kmh=80 if location.location_type is LocationType.HIGHWAY else 60,
            road_direction_deg=direction,
        )
        camera.connections.append(_connection(index, location.district))
        session.add(camera)
        await session.flush()
        session.add_all(_zones(camera.id, camera_type, location, direction))
        if location.location_type is LocationType.INTERSECTION:
            session.add(
                TrafficLight(
                    code=f"TL-{code}",
                    camera_id=camera.id,
                    location_id=location_ids[slot],
                    source=TrafficLightSource.SIMULATED,
                    roi={"x": 0.82, "y": 0.05, "w": 0.06, "h": 0.18},
                )
            )
        report.add("cameras", 1)
    await session.flush()


async def _seed_settings(session: AsyncSession, report: SeedReport) -> None:
    result = await session.execute(
        insert(SystemSetting)
        .values(
            [
                {"key": key, "value": value, "description": description}
                for key, (value, description) in ref.SYSTEM_SETTINGS.items()
            ]
        )
        .on_conflict_do_nothing(index_elements=[SystemSetting.key])
        .returning(SystemSetting.key)
    )
    report.add("system_settings", len(result.all()))


async def _seed_users(
    session: AsyncSession,
    users: list[UserSeed],
    allow_generated_passwords: bool,
    report: SeedReport,
) -> None:
    role_ids = dict((await session.execute(select(Role.code, Role.id))).all())
    for seed in users:
        exists = await session.scalar(
            select(User.id).where(User.username == seed.username, User.deleted_at.is_(None))
        )
        if exists is not None:
            continue
        password = seed.password
        if password is None:
            if not allow_generated_passwords:
                raise ValueError(f"A password is required to create user '{seed.username}'")
            password = secrets.token_urlsafe(12)
            report.generated_passwords[seed.username] = password
        elif len(password) < MIN_PASSWORD_LENGTH:
            raise ValueError(
                f"Password for '{seed.username}' must be at least {MIN_PASSWORD_LENGTH} characters"
            )
        session.add(
            User(
                username=seed.username,
                email=seed.email,
                full_name=seed.full_name,
                role_id=role_ids[seed.role],
                password_hash=hash_password(password),
            )
        )
        report.add("users", 1)
    await session.flush()
