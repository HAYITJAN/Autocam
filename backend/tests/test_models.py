from collections import Counter

from sqlalchemy.dialects import postgresql
from sqlalchemy.schema import CreateTable

import app.models  # noqa: F401
from app.db.base import Base
from app.seed import reference as ref

EXPECTED_TABLES = {
    "ai_detection_logs", "ai_models", "audit_logs", "camera_availability_daily",
    "camera_connections", "camera_health_logs", "cameras", "districts", "locations",
    "network_logs", "notifications", "password_reset_tokens", "permissions", "reports",
    "role_permissions", "roles", "system_logs", "system_settings", "traffic_lights",
    "traffic_stats_hourly", "traffic_zones", "user_sessions", "users", "vehicle_detections",
    "vehicle_types", "vehicles", "violation_events", "violation_evidence",
    "violation_stats_hourly", "violation_types", "violations",
}  # fmt: skip


def test_all_tables_are_registered() -> None:
    assert set(Base.metadata.tables) == EXPECTED_TABLES


def test_partitioned_tables_use_composite_primary_key() -> None:
    for name, column in (
        ("camera_health_logs", "recorded_at"),
        ("vehicle_detections", "detected_at"),
    ):
        table = Base.metadata.tables[name]
        ddl = str(CreateTable(table).compile(dialect=postgresql.dialect()))  # type: ignore[no-untyped-call]

        assert f"PARTITION BY RANGE ({column})" in ddl
        assert {c.name for c in table.primary_key.columns} == {"id", column}


def test_constraint_names_follow_convention() -> None:
    for table in Base.metadata.tables.values():
        for constraint in table.constraints:
            assert constraint.name, f"unnamed constraint on {table.name}"
            assert str(constraint.name).split("_")[0] in {"pk", "fk", "uq", "ck"}


def test_violation_code_is_generated_by_sequence() -> None:
    code = Base.metadata.tables["violations"].c.code
    assert code.server_default is not None
    assert "violation_code_seq" in str(code.server_default.arg)  # type: ignore[attr-defined]


def test_permission_matrix_is_consistent() -> None:
    codes = [code for code, _, _ in ref.PERMISSIONS]

    assert len(codes) == len(set(codes)) == 21
    assert {code for code, _, _ in ref.ROLES} == set(ref.ROLE_PERMISSIONS)
    assert ref.ROLE_PERMISSIONS[ref.ADMIN_ROLE] == set(codes)
    for perms in ref.ROLE_PERMISSIONS.values():
        assert perms <= set(codes)
        assert "dashboard.view" in perms


def test_reference_geography_is_consistent() -> None:
    districts = {d.code for d in ref.DISTRICTS}

    assert len(districts) == 12
    assert len(ref.LOCATIONS) == 30
    assert all(loc.district in districts for loc in ref.LOCATIONS)
    keys = Counter((loc.district, loc.name) for loc in ref.LOCATIONS)
    assert not [key for key, count in keys.items() if count > 1]
    coordinates = [(d.lat, d.lng) for d in ref.DISTRICTS] + [(x.lat, x.lng) for x in ref.LOCATIONS]
    for lat, lng in coordinates:
        assert 41.1 < lat < 41.45
        assert 69.1 < lng < 69.45
