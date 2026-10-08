"""initial schema

Creates the full SMART TRAFFIC schema: enum types, sequences, all tables and
indexes, monthly RANGE partitioning for camera_health_logs / vehicle_detections
(default partition + ensure_monthly_partition() helper), and pg_trgm plate
search indexes when the extension is available on the server.

Revision ID: 0001
Revises:
Create Date: 2026-10-08 10:46:30.570019
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = '0001'
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ENUMS: dict[str, postgresql.ENUM] = {
    'ai_model_task': postgresql.ENUM('VEHICLE_DETECTION', 'PLATE_DETECTION', 'PLATE_OCR', name='ai_model_task', create_type=False),
    'log_level': postgresql.ENUM('DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL', name='log_level', create_type=False),
    'severity': postgresql.ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL', name='severity', create_type=False),
    'location_type': postgresql.ENUM('INTERSECTION', 'STREET', 'HIGHWAY', 'PARKING', name='location_type', create_type=False),
    'user_status': postgresql.ENUM('ACTIVE', 'INACTIVE', 'BLOCKED', name='user_status', create_type=False),
    'camera_type': postgresql.ENUM('FIXED', 'PTZ', 'ANPR', 'SPEED', name='camera_type', create_type=False),
    'camera_status': postgresql.ENUM('ONLINE', 'OFFLINE', 'WARNING', 'MAINTENANCE', name='camera_status', create_type=False),
    'notification_type': postgresql.ENUM('CRITICAL', 'WARNING', 'INFO', 'SYSTEM', 'VIOLATION', name='notification_type', create_type=False),
    'notification_state': postgresql.ENUM('UNREAD', 'READ', 'ARCHIVED', name='notification_state', create_type=False),
    'report_type': postgresql.ENUM('DAILY', 'WEEKLY', 'MONTHLY', 'VIOLATION', 'CAMERA', 'VEHICLE', 'AI_PERFORMANCE', 'SYSTEM', name='report_type', create_type=False),
    'report_format': postgresql.ENUM('PDF', 'XLSX', 'CSV', name='report_format', create_type=False),
    'report_status': postgresql.ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', name='report_status', create_type=False),
    'connection_type': postgresql.ENUM('WIFI', 'LTE_4G', 'ETHERNET', name='connection_type', create_type=False),
    'connection_status': postgresql.ENUM('CONNECTED', 'DEGRADED', 'DISCONNECTED', name='connection_status', create_type=False),
    'traffic_light_source': postgresql.ENUM('CONTROLLER', 'VISION', 'SIMULATED', name='traffic_light_source', create_type=False),
    'traffic_light_state': postgresql.ENUM('RED', 'YELLOW', 'GREEN', 'UNKNOWN', name='traffic_light_state', create_type=False),
    'zone_type': postgresql.ENUM('STOP_LINE', 'PARKING_RESTRICTED', 'LANE_DIRECTION', 'SPEED_TRAP', 'DETECTION_AREA', name='zone_type', create_type=False),
    'vehicle_status': postgresql.ENUM('NORMAL', 'WATCHLIST', 'BLACKLIST', name='vehicle_status', create_type=False),
    'violation_status': postgresql.ENUM('NEW', 'UNDER_REVIEW', 'CONFIRMED', 'REJECTED', 'ARCHIVED', name='violation_status', create_type=False),
    'network_event': postgresql.ENUM('CONNECTED', 'DISCONNECTED', 'DEGRADED', 'RECOVERED', 'SWITCHED', name='network_event', create_type=False),
    'violation_event_type': postgresql.ENUM('CREATED', 'STATUS_CHANGED', 'ASSIGNED', 'COMMENT', 'EXPORTED', 'REPORT_GENERATED', name='violation_event_type', create_type=False),
    'evidence_type': postgresql.ENUM('IMAGE_MAIN', 'IMAGE_BEFORE', 'IMAGE_AFTER', 'VIDEO_CLIP', 'PLATE_CROP', 'VEHICLE_CROP', 'DETECTION_FRAME', name='evidence_type', create_type=False),
}

SEQUENCES = ("violation_code_seq", "camera_health_logs_id_seq", "vehicle_detections_id_seq")
PARTITIONED = {"camera_health_logs": "camera_health_logs_id_seq", "vehicle_detections": "vehicle_detections_id_seq"}

ENSURE_MONTHLY_PARTITION = """
CREATE OR REPLACE FUNCTION ensure_monthly_partition(parent regclass, month_start date)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
    start_ts timestamptz := date_trunc('month', month_start)::timestamp AT TIME ZONE 'UTC';
    end_ts timestamptz := (date_trunc('month', month_start) + interval '1 month')::timestamp AT TIME ZONE 'UTC';
    partition_name text := format('%s_y%s', parent::text, to_char(date_trunc('month', month_start), 'YYYY"m"MM'));
BEGIN
    IF to_regclass(partition_name) IS NULL THEN
        EXECUTE format(
            'CREATE TABLE %I PARTITION OF %s FOR VALUES FROM (%L) TO (%L)',
            partition_name, parent, start_ts, end_ts
        );
    END IF;
    RETURN partition_name;
END
$$;
"""

TRIGRAM_INDEXES = """
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_trgm') THEN
        CREATE EXTENSION IF NOT EXISTS pg_trgm;
        CREATE INDEX IF NOT EXISTS ix_vehicles_plate_trgm
            ON vehicles USING gin (plate_number gin_trgm_ops);
        CREATE INDEX IF NOT EXISTS ix_violations_plate_trgm
            ON violations USING gin (plate_number gin_trgm_ops);
    ELSE
        RAISE NOTICE 'pg_trgm is not available: plate fuzzy-search indexes skipped';
    END IF;
END
$$;
"""


def upgrade() -> None:
    bind = op.get_bind()
    for enum in ENUMS.values():
        enum.create(bind, checkfirst=True)
    for name in SEQUENCES:
        op.execute(sa.schema.CreateSequence(sa.Sequence(name), if_not_exists=True))

    _create_tables()

    for table, sequence in PARTITIONED.items():
        op.execute(f"ALTER SEQUENCE {sequence} OWNED BY {table}.id")
        op.execute(f"CREATE TABLE {table}_default PARTITION OF {table} DEFAULT")
    op.execute(ENSURE_MONTHLY_PARTITION)
    for table in PARTITIONED:
        # Previous, current and next two months (UTC); later months are created by the
        # maintenance task before data arrives.
        op.execute(
            f"SELECT ensure_monthly_partition('{table}'::regclass, "
            f"(date_trunc('month', now() AT TIME ZONE 'UTC') + make_interval(months => m))::date) "
            f"FROM generate_series(-1, 2) AS m"
        )
    op.execute(TRIGRAM_INDEXES)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_violations_plate_trgm")
    op.execute("DROP INDEX IF EXISTS ix_vehicles_plate_trgm")
    _drop_tables()
    op.execute("DROP FUNCTION IF EXISTS ensure_monthly_partition(regclass, date)")
    for name in SEQUENCES:
        op.execute(sa.schema.DropSequence(sa.Sequence(name), if_exists=True))
    bind = op.get_bind()
    for enum in reversed(ENUMS.values()):
        enum.drop(bind, checkfirst=True)


def _create_tables() -> None:
    op.create_table('ai_models',
    sa.Column('name', sa.String(length=100), nullable=False),
    sa.Column('version', sa.String(length=30), nullable=False),
    sa.Column('framework', sa.String(length=30), nullable=False),
    sa.Column('task', ENUMS['ai_model_task'], nullable=False),
    sa.Column('weights_uri', sa.String(length=500), nullable=True),
    sa.Column('description', sa.Text(), nullable=True),
    sa.Column('confidence_threshold', sa.Numeric(precision=4, scale=3, asdecimal=False), server_default='0.5', nullable=False),
    sa.Column('iou_threshold', sa.Numeric(precision=4, scale=3, asdecimal=False), server_default='0.45', nullable=False),
    sa.Column('vehicle_detection', sa.Boolean(), server_default=sa.text('true'), nullable=False),
    sa.Column('plate_recognition', sa.Boolean(), server_default=sa.text('true'), nullable=False),
    sa.Column('speed_detection', sa.Boolean(), server_default=sa.text('true'), nullable=False),
    sa.Column('red_light_detection', sa.Boolean(), server_default=sa.text('true'), nullable=False),
    sa.Column('parking_detection', sa.Boolean(), server_default=sa.text('true'), nullable=False),
    sa.Column('wrong_direction_detection', sa.Boolean(), server_default=sa.text('true'), nullable=False),
    sa.Column('is_active', sa.Boolean(), server_default=sa.text('false'), nullable=False),
    sa.Column('id', sa.BigInteger(), sa.Identity(always=True), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint('confidence_threshold BETWEEN 0 AND 1', name=op.f('ck_ai_models_confidence_threshold_range')),
    sa.CheckConstraint('iou_threshold BETWEEN 0 AND 1', name=op.f('ck_ai_models_iou_threshold_range')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_ai_models')),
    sa.UniqueConstraint('name', 'version', name=op.f('uq_ai_models_name_version'))
    )
    op.create_table('districts',
    sa.Column('code', sa.String(length=50), nullable=False),
    sa.Column('name', sa.String(length=100), nullable=False),
    sa.Column('center_lat', sa.Numeric(precision=9, scale=6, asdecimal=False), nullable=False),
    sa.Column('center_lng', sa.Numeric(precision=9, scale=6, asdecimal=False), nullable=False),
    sa.Column('boundary_geojson', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column('id', sa.BigInteger(), sa.Identity(always=True), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_districts')),
    sa.UniqueConstraint('code', name=op.f('uq_districts_code'))
    )
    op.create_table('permissions',
    sa.Column('code', sa.String(length=100), nullable=False),
    sa.Column('module', sa.String(length=50), nullable=False),
    sa.Column('name', sa.String(length=150), nullable=False),
    sa.Column('description', sa.Text(), nullable=True),
    sa.Column('id', sa.BigInteger(), sa.Identity(always=True), nullable=False),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_permissions')),
    sa.UniqueConstraint('code', name=op.f('uq_permissions_code'))
    )
    op.create_index(op.f('ix_permissions_module'), 'permissions', ['module'], unique=False)
    op.create_table('roles',
    sa.Column('code', sa.String(length=50), nullable=False),
    sa.Column('name', sa.String(length=100), nullable=False),
    sa.Column('description', sa.Text(), nullable=True),
    sa.Column('is_system', sa.Boolean(), server_default=sa.text('false'), nullable=False),
    sa.Column('id', sa.BigInteger(), sa.Identity(always=True), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_roles')),
    sa.UniqueConstraint('code', name=op.f('uq_roles_code'))
    )
    op.create_table('system_logs',
    sa.Column('level', ENUMS['log_level'], nullable=False),
    sa.Column('source', sa.String(length=30), nullable=False),
    sa.Column('event_code', sa.String(length=60), nullable=True),
    sa.Column('message', sa.Text(), nullable=False),
    sa.Column('context', postgresql.JSONB(astext_type=sa.Text()), server_default='{}', nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('id', sa.BigInteger(), sa.Identity(always=True), nullable=False),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_system_logs'))
    )
    op.create_index('ix_system_logs_level_created', 'system_logs', ['level', sa.literal_column('created_at DESC')], unique=False)
    op.create_index('ix_system_logs_source_created', 'system_logs', ['source', sa.literal_column('created_at DESC')], unique=False)
    op.create_table('vehicle_types',
    sa.Column('code', sa.String(length=20), nullable=False),
    sa.Column('name_uz', sa.String(length=50), nullable=False),
    sa.Column('name_en', sa.String(length=50), nullable=False),
    sa.Column('color', sa.String(length=9), nullable=False),
    sa.Column('icon', sa.String(length=50), nullable=True),
    sa.Column('id', sa.BigInteger(), sa.Identity(always=True), nullable=False),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_vehicle_types')),
    sa.UniqueConstraint('code', name=op.f('uq_vehicle_types_code'))
    )
    op.create_table('violation_types',
    sa.Column('code', sa.String(length=40), nullable=False),
    sa.Column('name_uz', sa.String(length=100), nullable=False),
    sa.Column('name_en', sa.String(length=100), nullable=False),
    sa.Column('severity', ENUMS['severity'], nullable=False),
    sa.Column('fine_amount', sa.Numeric(precision=12, scale=2, asdecimal=False), nullable=True),
    sa.Column('color', sa.String(length=9), nullable=False),
    sa.Column('icon', sa.String(length=50), nullable=True),
    sa.Column('rule_params', postgresql.JSONB(astext_type=sa.Text()), server_default='{}', nullable=False),
    sa.Column('is_active', sa.Boolean(), server_default=sa.text('true'), nullable=False),
    sa.Column('id', sa.BigInteger(), sa.Identity(always=True), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_violation_types')),
    sa.UniqueConstraint('code', name=op.f('uq_violation_types_code'))
    )
    op.create_table('locations',
    sa.Column('district_id', sa.BigInteger(), nullable=False),
    sa.Column('name', sa.String(length=200), nullable=False),
    sa.Column('address', sa.String(length=300), nullable=True),
    sa.Column('location_type', ENUMS['location_type'], nullable=False),
    sa.Column('latitude', sa.Numeric(precision=9, scale=6, asdecimal=False), nullable=False),
    sa.Column('longitude', sa.Numeric(precision=9, scale=6, asdecimal=False), nullable=False),
    sa.Column('id', sa.BigInteger(), sa.Identity(always=True), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['district_id'], ['districts.id'], name=op.f('fk_locations_district_id_districts'), ondelete='RESTRICT'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_locations'))
    )
    op.create_index(op.f('ix_locations_district_id'), 'locations', ['district_id'], unique=False)
    op.create_table('role_permissions',
    sa.Column('role_id', sa.BigInteger(), nullable=False),
    sa.Column('permission_id', sa.BigInteger(), nullable=False),
    sa.ForeignKeyConstraint(['permission_id'], ['permissions.id'], name=op.f('fk_role_permissions_permission_id_permissions'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['role_id'], ['roles.id'], name=op.f('fk_role_permissions_role_id_roles'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('role_id', 'permission_id', name=op.f('pk_role_permissions'))
    )
    op.create_index(op.f('ix_role_permissions_permission_id'), 'role_permissions', ['permission_id'], unique=False)
    op.create_table('users',
    sa.Column('full_name', sa.String(length=150), nullable=False),
    sa.Column('username', sa.String(length=50), nullable=False),
    sa.Column('email', sa.String(length=255), nullable=False),
    sa.Column('phone', sa.String(length=32), nullable=True),
    sa.Column('password_hash', sa.String(length=255), nullable=False),
    sa.Column('role_id', sa.BigInteger(), nullable=False),
    sa.Column('avatar', sa.String(length=500), nullable=True),
    sa.Column('status', ENUMS['user_status'], server_default='ACTIVE', nullable=False),
    sa.Column('failed_login_attempts', sa.Integer(), server_default='0', nullable=False),
    sa.Column('locked_until', sa.DateTime(timezone=True), nullable=True),
    sa.Column('token_version', sa.Integer(), server_default='0', nullable=False),
    sa.Column('last_login', sa.DateTime(timezone=True), nullable=True),
    sa.Column('id', sa.BigInteger(), sa.Identity(always=True), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['role_id'], ['roles.id'], name=op.f('fk_users_role_id_roles'), ondelete='RESTRICT'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_users'))
    )
    op.create_index(op.f('ix_users_deleted_at'), 'users', ['deleted_at'], unique=False)
    op.create_index(op.f('ix_users_role_id'), 'users', ['role_id'], unique=False)
    op.create_index(op.f('ix_users_status'), 'users', ['status'], unique=False)
    op.create_index('uq_users_email_active', 'users', ['email'], unique=True, postgresql_where=sa.text('deleted_at IS NULL'))
    op.create_index('uq_users_username_active', 'users', ['username'], unique=True, postgresql_where=sa.text('deleted_at IS NULL'))
    op.create_table('audit_logs',
    sa.Column('user_id', sa.BigInteger(), nullable=True),
    sa.Column('action', sa.String(length=60), nullable=False),
    sa.Column('entity_type', sa.String(length=50), nullable=True),
    sa.Column('entity_id', sa.String(length=64), nullable=True),
    sa.Column('ip_address', postgresql.INET(), nullable=True),
    sa.Column('user_agent', sa.String(length=500), nullable=True),
    sa.Column('metadata', postgresql.JSONB(astext_type=sa.Text()), server_default='{}', nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('id', sa.BigInteger(), sa.Identity(always=True), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_audit_logs_user_id_users'), ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_audit_logs'))
    )
    op.create_index('ix_audit_logs_action_created', 'audit_logs', ['action', sa.literal_column('created_at DESC')], unique=False)
    op.create_index('ix_audit_logs_created_at', 'audit_logs', [sa.literal_column('created_at DESC')], unique=False)
    op.create_index('ix_audit_logs_entity', 'audit_logs', ['entity_type', 'entity_id'], unique=False)
    op.create_index('ix_audit_logs_user_created', 'audit_logs', ['user_id', sa.literal_column('created_at DESC')], unique=False)
    op.create_table('cameras',
    sa.Column('code', sa.String(length=20), nullable=False),
    sa.Column('name', sa.String(length=150), nullable=False),
    sa.Column('location_id', sa.BigInteger(), nullable=False),
    sa.Column('camera_type', ENUMS['camera_type'], nullable=False),
    sa.Column('status', ENUMS['camera_status'], server_default='OFFLINE', nullable=False),
    sa.Column('is_enabled', sa.Boolean(), server_default=sa.text('true'), nullable=False),
    sa.Column('ip_address', postgresql.INET(), nullable=True),
    sa.Column('port', sa.Integer(), nullable=True),
    sa.Column('mac_address', sa.String(length=17), nullable=True),
    sa.Column('rtsp_url', sa.String(length=500), nullable=True),
    sa.Column('username', sa.String(length=100), nullable=True),
    sa.Column('password_encrypted', sa.LargeBinary(), nullable=True),
    sa.Column('resolution', sa.String(length=20), server_default='1920x1080', nullable=False),
    sa.Column('fps_target', sa.SmallInteger(), server_default='25', nullable=False),
    sa.Column('ai_enabled', sa.Boolean(), server_default=sa.text('true'), nullable=False),
    sa.Column('recording_enabled', sa.Boolean(), server_default=sa.text('true'), nullable=False),
    sa.Column('retention_days', sa.SmallInteger(), server_default='30', nullable=False),
    sa.Column('confidence_threshold', sa.Numeric(precision=4, scale=3, asdecimal=False), server_default='0.5', nullable=False),
    sa.Column('ai_model_id', sa.BigInteger(), nullable=True),
    sa.Column('speed_limit_kmh', sa.SmallInteger(), server_default='60', nullable=False),
    sa.Column('road_direction_deg', sa.Numeric(precision=5, scale=2, asdecimal=False), nullable=True),
    sa.Column('ai_config', postgresql.JSONB(astext_type=sa.Text()), server_default='{}', nullable=False),
    sa.Column('installed_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('last_heartbeat_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('id', sa.BigInteger(), sa.Identity(always=True), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
    sa.CheckConstraint('confidence_threshold BETWEEN 0 AND 1', name=op.f('ck_cameras_confidence_threshold_range')),
    sa.CheckConstraint('fps_target BETWEEN 1 AND 120', name=op.f('ck_cameras_fps_target_range')),
    sa.CheckConstraint('port IS NULL OR port BETWEEN 1 AND 65535', name=op.f('ck_cameras_port_range')),
    sa.CheckConstraint('retention_days BETWEEN 1 AND 3650', name=op.f('ck_cameras_retention_days_range')),
    sa.ForeignKeyConstraint(['ai_model_id'], ['ai_models.id'], name=op.f('fk_cameras_ai_model_id_ai_models'), ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['location_id'], ['locations.id'], name=op.f('fk_cameras_location_id_locations'), ondelete='RESTRICT'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_cameras')),
    sa.UniqueConstraint('code', name=op.f('uq_cameras_code'))
    )
    op.create_index(op.f('ix_cameras_ai_model_id'), 'cameras', ['ai_model_id'], unique=False)
    op.create_index(op.f('ix_cameras_deleted_at'), 'cameras', ['deleted_at'], unique=False)
    op.create_index(op.f('ix_cameras_last_heartbeat_at'), 'cameras', ['last_heartbeat_at'], unique=False)
    op.create_index(op.f('ix_cameras_location_id'), 'cameras', ['location_id'], unique=False)
    op.create_index(op.f('ix_cameras_status'), 'cameras', ['status'], unique=False)
    op.create_table('notifications',
    sa.Column('user_id', sa.BigInteger(), nullable=False),
    sa.Column('type', ENUMS['notification_type'], nullable=False),
    sa.Column('category', sa.String(length=50), nullable=False),
    sa.Column('title', sa.String(length=200), nullable=False),
    sa.Column('message', sa.Text(), nullable=False),
    sa.Column('entity_type', sa.String(length=50), nullable=True),
    sa.Column('entity_id', sa.String(length=64), nullable=True),
    sa.Column('link', sa.String(length=300), nullable=True),
    sa.Column('payload', postgresql.JSONB(astext_type=sa.Text()), server_default='{}', nullable=False),
    sa.Column('state', ENUMS['notification_state'], server_default='UNREAD', nullable=False),
    sa.Column('read_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('id', sa.BigInteger(), sa.Identity(always=True), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_notifications_user_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_notifications'))
    )
    op.create_index('ix_notifications_user_state_created', 'notifications', ['user_id', 'state', sa.literal_column('created_at DESC')], unique=False)
    op.create_table('password_reset_tokens',
    sa.Column('user_id', sa.BigInteger(), nullable=False),
    sa.Column('token_hash', sa.String(length=64), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('used_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('id', sa.BigInteger(), sa.Identity(always=True), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_password_reset_tokens_user_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_password_reset_tokens')),
    sa.UniqueConstraint('token_hash', name=op.f('uq_password_reset_tokens_token_hash'))
    )
    op.create_index(op.f('ix_password_reset_tokens_user_id'), 'password_reset_tokens', ['user_id'], unique=False)
    op.create_table('reports',
    sa.Column('report_type', ENUMS['report_type'], nullable=False),
    sa.Column('format', ENUMS['report_format'], nullable=False),
    sa.Column('title', sa.String(length=200), nullable=False),
    sa.Column('filters', postgresql.JSONB(astext_type=sa.Text()), server_default='{}', nullable=False),
    sa.Column('date_from', sa.DateTime(timezone=True), nullable=False),
    sa.Column('date_to', sa.DateTime(timezone=True), nullable=False),
    sa.Column('status', ENUMS['report_status'], server_default='PENDING', nullable=False),
    sa.Column('storage_key', sa.String(length=500), nullable=True),
    sa.Column('size_bytes', sa.BigInteger(), nullable=True),
    sa.Column('error_message', sa.Text(), nullable=True),
    sa.Column('task_id', sa.String(length=64), nullable=True),
    sa.Column('created_by', sa.BigInteger(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('id', sa.BigInteger(), sa.Identity(always=True), nullable=False),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], name=op.f('fk_reports_created_by_users'), ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_reports'))
    )
    op.create_index('ix_reports_created_by_created', 'reports', ['created_by', sa.literal_column('created_at DESC')], unique=False)
    op.create_index(op.f('ix_reports_status'), 'reports', ['status'], unique=False)
    op.create_table('system_settings',
    sa.Column('key', sa.String(length=100), nullable=False),
    sa.Column('value', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('description', sa.Text(), nullable=True),
    sa.Column('updated_by', sa.BigInteger(), nullable=True),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['updated_by'], ['users.id'], name=op.f('fk_system_settings_updated_by_users'), ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('key', name=op.f('pk_system_settings'))
    )
    op.create_table('user_sessions',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('user_id', sa.BigInteger(), nullable=False),
    sa.Column('family_id', sa.UUID(), nullable=False),
    sa.Column('refresh_token_hash', sa.String(length=64), nullable=False),
    sa.Column('ip_address', postgresql.INET(), nullable=True),
    sa.Column('user_agent', sa.String(length=500), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('last_used_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_user_sessions_user_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_user_sessions')),
    sa.UniqueConstraint('refresh_token_hash', name=op.f('uq_user_sessions_refresh_token_hash'))
    )
    op.create_index(op.f('ix_user_sessions_expires_at'), 'user_sessions', ['expires_at'], unique=False)
    op.create_index(op.f('ix_user_sessions_family_id'), 'user_sessions', ['family_id'], unique=False)
    op.create_index(op.f('ix_user_sessions_user_id'), 'user_sessions', ['user_id'], unique=False)
    op.create_table('ai_detection_logs',
    sa.Column('camera_id', sa.BigInteger(), nullable=False),
    sa.Column('ai_model_id', sa.BigInteger(), nullable=True),
    sa.Column('window_start', sa.DateTime(timezone=True), nullable=False),
    sa.Column('window_seconds', sa.Integer(), nullable=False),
    sa.Column('frames_processed', sa.Integer(), server_default='0', nullable=False),
    sa.Column('avg_inference_ms', sa.Numeric(precision=8, scale=2, asdecimal=False), nullable=True),
    sa.Column('objects_detected', sa.Integer(), server_default='0', nullable=False),
    sa.Column('plates_read', sa.Integer(), server_default='0', nullable=False),
    sa.Column('violations_detected', sa.Integer(), server_default='0', nullable=False),
    sa.Column('errors', sa.Integer(), server_default='0', nullable=False),
    sa.Column('payload', postgresql.JSONB(astext_type=sa.Text()), server_default='{}', nullable=False),
    sa.Column('id', sa.BigInteger(), sa.Identity(always=True), nullable=False),
    sa.ForeignKeyConstraint(['ai_model_id'], ['ai_models.id'], name=op.f('fk_ai_detection_logs_ai_model_id_ai_models'), ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['camera_id'], ['cameras.id'], name=op.f('fk_ai_detection_logs_camera_id_cameras'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_ai_detection_logs'))
    )
    op.create_index(op.f('ix_ai_detection_logs_ai_model_id'), 'ai_detection_logs', ['ai_model_id'], unique=False)
    op.create_index('ix_ai_detection_logs_camera_window', 'ai_detection_logs', ['camera_id', sa.literal_column('window_start DESC')], unique=False)
    op.create_table('camera_availability_daily',
    sa.Column('camera_id', sa.BigInteger(), nullable=False),
    sa.Column('day', sa.Date(), nullable=False),
    sa.Column('online_seconds', sa.Integer(), server_default='0', nullable=False),
    sa.Column('offline_seconds', sa.Integer(), server_default='0', nullable=False),
    sa.Column('warning_seconds', sa.Integer(), server_default='0', nullable=False),
    sa.Column('avg_fps', sa.Numeric(precision=5, scale=2, asdecimal=False), nullable=True),
    sa.Column('avg_latency_ms', sa.Numeric(precision=8, scale=2, asdecimal=False), nullable=True),
    sa.ForeignKeyConstraint(['camera_id'], ['cameras.id'], name=op.f('fk_camera_availability_daily_camera_id_cameras'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('camera_id', 'day', name=op.f('pk_camera_availability_daily'))
    )
    op.create_index(op.f('ix_camera_availability_daily_day'), 'camera_availability_daily', ['day'], unique=False)
    op.create_table('camera_connections',
    sa.Column('camera_id', sa.BigInteger(), nullable=False),
    sa.Column('connection_type', ENUMS['connection_type'], nullable=False),
    sa.Column('is_primary', sa.Boolean(), server_default=sa.text('true'), nullable=False),
    sa.Column('ssid_or_apn', sa.String(length=100), nullable=True),
    sa.Column('operator', sa.String(length=100), nullable=True),
    sa.Column('ip_address', postgresql.INET(), nullable=True),
    sa.Column('status', ENUMS['connection_status'], server_default='DISCONNECTED', nullable=False),
    sa.Column('signal_strength_dbm', sa.SmallInteger(), nullable=True),
    sa.Column('bandwidth_mbps', sa.Numeric(precision=8, scale=2, asdecimal=False), nullable=True),
    sa.Column('config', postgresql.JSONB(astext_type=sa.Text()), server_default='{}', nullable=False),
    sa.Column('id', sa.BigInteger(), sa.Identity(always=True), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['camera_id'], ['cameras.id'], name=op.f('fk_camera_connections_camera_id_cameras'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_camera_connections'))
    )
    op.create_index(op.f('ix_camera_connections_camera_id'), 'camera_connections', ['camera_id'], unique=False)
    op.create_index('uq_camera_connections_primary', 'camera_connections', ['camera_id'], unique=True, postgresql_where=sa.text('is_primary'))
    op.create_table('camera_health_logs',
    sa.Column('id', sa.BigInteger(), server_default=sa.text("nextval('camera_health_logs_id_seq')"), nullable=False),
    sa.Column('recorded_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('camera_id', sa.BigInteger(), nullable=False),
    sa.Column('status', ENUMS['camera_status'], nullable=False),
    sa.Column('fps', sa.Numeric(precision=5, scale=2, asdecimal=False), nullable=True),
    sa.Column('latency_ms', sa.Integer(), nullable=True),
    sa.Column('cpu_percent', sa.Numeric(precision=5, scale=2, asdecimal=False), nullable=True),
    sa.Column('temperature_c', sa.Numeric(precision=5, scale=2, asdecimal=False), nullable=True),
    sa.Column('signal_strength_dbm', sa.SmallInteger(), nullable=True),
    sa.Column('packet_loss_pct', sa.Numeric(precision=5, scale=2, asdecimal=False), nullable=True),
    sa.Column('uptime_seconds', sa.BigInteger(), nullable=True),
    sa.ForeignKeyConstraint(['camera_id'], ['cameras.id'], name=op.f('fk_camera_health_logs_camera_id_cameras'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', 'recorded_at', name=op.f('pk_camera_health_logs')),
    postgresql_partition_by='RANGE (recorded_at)'
    )
    op.create_index('ix_camera_health_logs_camera_recorded', 'camera_health_logs', ['camera_id', sa.literal_column('recorded_at DESC')], unique=False)
    op.create_table('traffic_lights',
    sa.Column('code', sa.String(length=30), nullable=False),
    sa.Column('camera_id', sa.BigInteger(), nullable=True),
    sa.Column('location_id', sa.BigInteger(), nullable=True),
    sa.Column('source', ENUMS['traffic_light_source'], nullable=False),
    sa.Column('roi', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column('controller_url', sa.String(length=500), nullable=True),
    sa.Column('current_state', ENUMS['traffic_light_state'], server_default='UNKNOWN', nullable=False),
    sa.Column('state_changed_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('id', sa.BigInteger(), sa.Identity(always=True), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['camera_id'], ['cameras.id'], name=op.f('fk_traffic_lights_camera_id_cameras'), ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['location_id'], ['locations.id'], name=op.f('fk_traffic_lights_location_id_locations'), ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_traffic_lights')),
    sa.UniqueConstraint('code', name=op.f('uq_traffic_lights_code'))
    )
    op.create_index(op.f('ix_traffic_lights_camera_id'), 'traffic_lights', ['camera_id'], unique=False)
    op.create_index(op.f('ix_traffic_lights_location_id'), 'traffic_lights', ['location_id'], unique=False)
    op.create_table('traffic_stats_hourly',
    sa.Column('camera_id', sa.BigInteger(), nullable=False),
    sa.Column('hour_bucket', sa.DateTime(timezone=True), nullable=False),
    sa.Column('vehicle_type_id', sa.BigInteger(), nullable=False),
    sa.Column('vehicle_count', sa.Integer(), server_default='0', nullable=False),
    sa.Column('avg_speed_kmh', sa.Numeric(precision=6, scale=2, asdecimal=False), nullable=True),
    sa.Column('max_speed_kmh', sa.Numeric(precision=6, scale=2, asdecimal=False), nullable=True),
    sa.ForeignKeyConstraint(['camera_id'], ['cameras.id'], name=op.f('fk_traffic_stats_hourly_camera_id_cameras'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['vehicle_type_id'], ['vehicle_types.id'], name=op.f('fk_traffic_stats_hourly_vehicle_type_id_vehicle_types'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('camera_id', 'hour_bucket', 'vehicle_type_id', name=op.f('pk_traffic_stats_hourly'))
    )
    op.create_index(op.f('ix_traffic_stats_hourly_hour_bucket'), 'traffic_stats_hourly', ['hour_bucket'], unique=False)
    op.create_table('traffic_zones',
    sa.Column('camera_id', sa.BigInteger(), nullable=False),
    sa.Column('name', sa.String(length=100), nullable=False),
    sa.Column('zone_type', ENUMS['zone_type'], nullable=False),
    sa.Column('geometry', postgresql.JSONB(astext_type=sa.Text()), server_default='{}', nullable=False),
    sa.Column('config', postgresql.JSONB(astext_type=sa.Text()), server_default='{}', nullable=False),
    sa.Column('is_active', sa.Boolean(), server_default=sa.text('true'), nullable=False),
    sa.Column('id', sa.BigInteger(), sa.Identity(always=True), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['camera_id'], ['cameras.id'], name=op.f('fk_traffic_zones_camera_id_cameras'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_traffic_zones'))
    )
    op.create_index(op.f('ix_traffic_zones_camera_id'), 'traffic_zones', ['camera_id'], unique=False)
    op.create_table('vehicles',
    sa.Column('plate_number', sa.String(length=16), nullable=False),
    sa.Column('plate_display', sa.String(length=20), nullable=False),
    sa.Column('vehicle_type_id', sa.BigInteger(), nullable=True),
    sa.Column('brand', sa.String(length=60), nullable=True),
    sa.Column('model', sa.String(length=60), nullable=True),
    sa.Column('color', sa.String(length=30), nullable=True),
    sa.Column('vin', sa.String(length=17), nullable=True),
    sa.Column('owner_name', sa.String(length=150), nullable=True),
    sa.Column('status', ENUMS['vehicle_status'], server_default='NORMAL', nullable=False),
    sa.Column('status_reason', sa.Text(), nullable=True),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('first_seen_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('last_seen_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('last_camera_id', sa.BigInteger(), nullable=True),
    sa.Column('total_detections', sa.Integer(), server_default='0', nullable=False),
    sa.Column('total_violations', sa.Integer(), server_default='0', nullable=False),
    sa.Column('image_key', sa.String(length=500), nullable=True),
    sa.Column('id', sa.BigInteger(), sa.Identity(always=True), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['last_camera_id'], ['cameras.id'], name=op.f('fk_vehicles_last_camera_id_cameras'), ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['vehicle_type_id'], ['vehicle_types.id'], name=op.f('fk_vehicles_vehicle_type_id_vehicle_types'), ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_vehicles')),
    sa.UniqueConstraint('plate_number', name=op.f('uq_vehicles_plate_number'))
    )
    op.create_index(op.f('ix_vehicles_last_camera_id'), 'vehicles', ['last_camera_id'], unique=False)
    op.create_index('ix_vehicles_last_seen_at', 'vehicles', [sa.literal_column('last_seen_at DESC')], unique=False)
    op.create_index(op.f('ix_vehicles_status'), 'vehicles', ['status'], unique=False)
    op.create_index(op.f('ix_vehicles_vehicle_type_id'), 'vehicles', ['vehicle_type_id'], unique=False)
    op.create_index('uq_vehicles_vin', 'vehicles', ['vin'], unique=True, postgresql_where=sa.text('vin IS NOT NULL'))
    op.create_table('violation_stats_hourly',
    sa.Column('camera_id', sa.BigInteger(), nullable=False),
    sa.Column('hour_bucket', sa.DateTime(timezone=True), nullable=False),
    sa.Column('violation_type_id', sa.BigInteger(), nullable=False),
    sa.Column('status', ENUMS['violation_status'], nullable=False),
    sa.Column('count', sa.Integer(), server_default='0', nullable=False),
    sa.Column('avg_confidence', sa.Numeric(precision=5, scale=4, asdecimal=False), nullable=True),
    sa.ForeignKeyConstraint(['camera_id'], ['cameras.id'], name=op.f('fk_violation_stats_hourly_camera_id_cameras'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['violation_type_id'], ['violation_types.id'], name=op.f('fk_violation_stats_hourly_violation_type_id_violation_types'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('camera_id', 'hour_bucket', 'violation_type_id', 'status', name=op.f('pk_violation_stats_hourly'))
    )
    op.create_index(op.f('ix_violation_stats_hourly_hour_bucket'), 'violation_stats_hourly', ['hour_bucket'], unique=False)
    op.create_table('network_logs',
    sa.Column('camera_id', sa.BigInteger(), nullable=False),
    sa.Column('connection_id', sa.BigInteger(), nullable=True),
    sa.Column('recorded_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('network_type', ENUMS['connection_type'], nullable=False),
    sa.Column('event', ENUMS['network_event'], nullable=False),
    sa.Column('signal_strength_dbm', sa.SmallInteger(), nullable=True),
    sa.Column('latency_ms', sa.Integer(), nullable=True),
    sa.Column('packet_loss_pct', sa.Numeric(precision=5, scale=2, asdecimal=False), nullable=True),
    sa.Column('message', sa.Text(), nullable=True),
    sa.Column('id', sa.BigInteger(), sa.Identity(always=True), nullable=False),
    sa.ForeignKeyConstraint(['camera_id'], ['cameras.id'], name=op.f('fk_network_logs_camera_id_cameras'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['connection_id'], ['camera_connections.id'], name=op.f('fk_network_logs_connection_id_camera_connections'), ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_network_logs'))
    )
    op.create_index('ix_network_logs_camera_recorded', 'network_logs', ['camera_id', sa.literal_column('recorded_at DESC')], unique=False)
    op.create_index(op.f('ix_network_logs_connection_id'), 'network_logs', ['connection_id'], unique=False)
    op.create_table('vehicle_detections',
    sa.Column('id', sa.BigInteger(), server_default=sa.text("nextval('vehicle_detections_id_seq')"), nullable=False),
    sa.Column('detected_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('camera_id', sa.BigInteger(), nullable=False),
    sa.Column('vehicle_id', sa.BigInteger(), nullable=True),
    sa.Column('track_id', sa.String(length=64), nullable=False),
    sa.Column('vehicle_type_id', sa.BigInteger(), nullable=True),
    sa.Column('plate_text', sa.String(length=16), nullable=True),
    sa.Column('plate_confidence', sa.Numeric(precision=5, scale=4, asdecimal=False), nullable=True),
    sa.Column('detection_confidence', sa.Numeric(precision=5, scale=4, asdecimal=False), nullable=False),
    sa.Column('bbox', postgresql.JSONB(astext_type=sa.Text()), server_default='{}', nullable=False),
    sa.Column('speed_kmh', sa.Numeric(precision=6, scale=2, asdecimal=False), nullable=True),
    sa.Column('direction_deg', sa.Numeric(precision=5, scale=2, asdecimal=False), nullable=True),
    sa.Column('image_key', sa.String(length=500), nullable=True),
    sa.ForeignKeyConstraint(['camera_id'], ['cameras.id'], name=op.f('fk_vehicle_detections_camera_id_cameras'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['vehicle_id'], ['vehicles.id'], name=op.f('fk_vehicle_detections_vehicle_id_vehicles'), ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['vehicle_type_id'], ['vehicle_types.id'], name=op.f('fk_vehicle_detections_vehicle_type_id_vehicle_types'), ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id', 'detected_at', name=op.f('pk_vehicle_detections')),
    postgresql_partition_by='RANGE (detected_at)'
    )
    op.create_index('ix_vehicle_detections_camera_detected', 'vehicle_detections', ['camera_id', sa.literal_column('detected_at DESC')], unique=False)
    op.create_index('ix_vehicle_detections_detected_brin', 'vehicle_detections', ['detected_at'], unique=False, postgresql_using='brin')
    op.create_index('ix_vehicle_detections_vehicle_detected', 'vehicle_detections', ['vehicle_id', sa.literal_column('detected_at DESC')], unique=False)
    op.create_table('violations',
    sa.Column('code', sa.String(length=20), server_default=sa.text("'VL-' || lpad(nextval('violation_code_seq')::text, 6, '0')"), nullable=False),
    sa.Column('violation_type_id', sa.BigInteger(), nullable=False),
    sa.Column('camera_id', sa.BigInteger(), nullable=False),
    sa.Column('location_id', sa.BigInteger(), nullable=True),
    sa.Column('vehicle_id', sa.BigInteger(), nullable=True),
    sa.Column('vehicle_type_id', sa.BigInteger(), nullable=True),
    sa.Column('detection_id', sa.BigInteger(), nullable=True),
    sa.Column('zone_id', sa.BigInteger(), nullable=True),
    sa.Column('plate_number', sa.String(length=16), nullable=True),
    sa.Column('track_id', sa.String(length=64), nullable=True),
    sa.Column('status', ENUMS['violation_status'], server_default='NEW', nullable=False),
    sa.Column('ai_confidence', sa.Numeric(precision=5, scale=4, asdecimal=False), nullable=False),
    sa.Column('detected_speed', sa.Numeric(precision=6, scale=2, asdecimal=False), nullable=True),
    sa.Column('speed_limit', sa.Numeric(precision=6, scale=2, asdecimal=False), nullable=True),
    sa.Column('excess_speed', sa.Numeric(precision=6, scale=2, asdecimal=False), nullable=True),
    sa.Column('direction', sa.String(length=20), nullable=True),
    sa.Column('traffic_light_state', ENUMS['traffic_light_state'], nullable=True),
    sa.Column('occurred_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('assigned_to', sa.BigInteger(), nullable=True),
    sa.Column('reviewed_by', sa.BigInteger(), nullable=True),
    sa.Column('reviewed_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('rejection_reason', sa.Text(), nullable=True),
    sa.Column('idempotency_key', sa.String(length=200), nullable=True),
    sa.Column('metadata', postgresql.JSONB(astext_type=sa.Text()), server_default='{}', nullable=False),
    sa.Column('id', sa.BigInteger(), sa.Identity(always=True), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint('ai_confidence BETWEEN 0 AND 1', name=op.f('ck_violations_ai_confidence_range')),
    sa.CheckConstraint('excess_speed IS NULL OR excess_speed >= 0', name=op.f('ck_violations_excess_speed_positive')),
    sa.ForeignKeyConstraint(['assigned_to'], ['users.id'], name=op.f('fk_violations_assigned_to_users'), ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['camera_id'], ['cameras.id'], name=op.f('fk_violations_camera_id_cameras'), ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['location_id'], ['locations.id'], name=op.f('fk_violations_location_id_locations'), ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['reviewed_by'], ['users.id'], name=op.f('fk_violations_reviewed_by_users'), ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['vehicle_id'], ['vehicles.id'], name=op.f('fk_violations_vehicle_id_vehicles'), ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['vehicle_type_id'], ['vehicle_types.id'], name=op.f('fk_violations_vehicle_type_id_vehicle_types'), ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['violation_type_id'], ['violation_types.id'], name=op.f('fk_violations_violation_type_id_violation_types'), ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['zone_id'], ['traffic_zones.id'], name=op.f('fk_violations_zone_id_traffic_zones'), ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_violations')),
    sa.UniqueConstraint('code', name=op.f('uq_violations_code')),
    sa.UniqueConstraint('idempotency_key', name=op.f('uq_violations_idempotency_key'))
    )
    op.create_index('ix_violations_assigned_status', 'violations', ['assigned_to', 'status'], unique=False)
    op.create_index('ix_violations_camera_occurred', 'violations', ['camera_id', sa.literal_column('occurred_at DESC')], unique=False)
    op.create_index('ix_violations_location_occurred', 'violations', ['location_id', sa.literal_column('occurred_at DESC')], unique=False)
    op.create_index('ix_violations_occurred_at', 'violations', [sa.literal_column('occurred_at DESC')], unique=False)
    op.create_index(op.f('ix_violations_reviewed_by'), 'violations', ['reviewed_by'], unique=False)
    op.create_index('ix_violations_status_occurred', 'violations', ['status', sa.literal_column('occurred_at DESC')], unique=False)
    op.create_index('ix_violations_type_occurred', 'violations', ['violation_type_id', sa.literal_column('occurred_at DESC')], unique=False)
    op.create_index('ix_violations_vehicle_occurred', 'violations', ['vehicle_id', sa.literal_column('occurred_at DESC')], unique=False)
    op.create_index(op.f('ix_violations_vehicle_type_id'), 'violations', ['vehicle_type_id'], unique=False)
    op.create_index(op.f('ix_violations_zone_id'), 'violations', ['zone_id'], unique=False)
    op.create_table('violation_events',
    sa.Column('violation_id', sa.BigInteger(), nullable=False),
    sa.Column('event_type', ENUMS['violation_event_type'], nullable=False),
    sa.Column('from_status', ENUMS['violation_status'], nullable=True),
    sa.Column('to_status', ENUMS['violation_status'], nullable=True),
    sa.Column('actor_id', sa.BigInteger(), nullable=True),
    sa.Column('comment', sa.Text(), nullable=True),
    sa.Column('payload', postgresql.JSONB(astext_type=sa.Text()), server_default='{}', nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('id', sa.BigInteger(), sa.Identity(always=True), nullable=False),
    sa.ForeignKeyConstraint(['actor_id'], ['users.id'], name=op.f('fk_violation_events_actor_id_users'), ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['violation_id'], ['violations.id'], name=op.f('fk_violation_events_violation_id_violations'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_violation_events'))
    )
    op.create_index(op.f('ix_violation_events_actor_id'), 'violation_events', ['actor_id'], unique=False)
    op.create_index('ix_violation_events_violation_created', 'violation_events', ['violation_id', 'created_at'], unique=False)
    op.create_table('violation_evidence',
    sa.Column('violation_id', sa.BigInteger(), nullable=False),
    sa.Column('evidence_type', ENUMS['evidence_type'], nullable=False),
    sa.Column('storage_backend', sa.String(length=10), nullable=False),
    sa.Column('storage_key', sa.String(length=500), nullable=False),
    sa.Column('mime_type', sa.String(length=100), nullable=False),
    sa.Column('size_bytes', sa.BigInteger(), nullable=False),
    sa.Column('width', sa.Integer(), nullable=True),
    sa.Column('height', sa.Integer(), nullable=True),
    sa.Column('duration_s', sa.Numeric(precision=6, scale=2, asdecimal=False), nullable=True),
    sa.Column('sha256', sa.String(length=64), nullable=False),
    sa.Column('annotations', postgresql.JSONB(astext_type=sa.Text()), server_default='{}', nullable=False),
    sa.Column('captured_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('id', sa.BigInteger(), sa.Identity(always=True), nullable=False),
    sa.ForeignKeyConstraint(['violation_id'], ['violations.id'], name=op.f('fk_violation_evidence_violation_id_violations'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_violation_evidence'))
    )
    op.create_index(op.f('ix_violation_evidence_violation_id'), 'violation_evidence', ['violation_id'], unique=False)


def _drop_tables() -> None:
    op.drop_index(op.f('ix_violation_evidence_violation_id'), table_name='violation_evidence')
    op.drop_table('violation_evidence')
    op.drop_index('ix_violation_events_violation_created', table_name='violation_events')
    op.drop_index(op.f('ix_violation_events_actor_id'), table_name='violation_events')
    op.drop_table('violation_events')
    op.drop_index(op.f('ix_violations_zone_id'), table_name='violations')
    op.drop_index(op.f('ix_violations_vehicle_type_id'), table_name='violations')
    op.drop_index('ix_violations_vehicle_occurred', table_name='violations')
    op.drop_index('ix_violations_type_occurred', table_name='violations')
    op.drop_index('ix_violations_status_occurred', table_name='violations')
    op.drop_index(op.f('ix_violations_reviewed_by'), table_name='violations')
    op.drop_index('ix_violations_occurred_at', table_name='violations')
    op.drop_index('ix_violations_location_occurred', table_name='violations')
    op.drop_index('ix_violations_camera_occurred', table_name='violations')
    op.drop_index('ix_violations_assigned_status', table_name='violations')
    op.drop_table('violations')
    op.drop_index('ix_vehicle_detections_vehicle_detected', table_name='vehicle_detections')
    op.drop_index('ix_vehicle_detections_detected_brin', table_name='vehicle_detections', postgresql_using='brin')
    op.drop_index('ix_vehicle_detections_camera_detected', table_name='vehicle_detections')
    op.drop_table('vehicle_detections')
    op.drop_index(op.f('ix_network_logs_connection_id'), table_name='network_logs')
    op.drop_index('ix_network_logs_camera_recorded', table_name='network_logs')
    op.drop_table('network_logs')
    op.drop_index(op.f('ix_violation_stats_hourly_hour_bucket'), table_name='violation_stats_hourly')
    op.drop_table('violation_stats_hourly')
    op.drop_index('uq_vehicles_vin', table_name='vehicles', postgresql_where=sa.text('vin IS NOT NULL'))
    op.drop_index(op.f('ix_vehicles_vehicle_type_id'), table_name='vehicles')
    op.drop_index(op.f('ix_vehicles_status'), table_name='vehicles')
    op.drop_index('ix_vehicles_last_seen_at', table_name='vehicles')
    op.drop_index(op.f('ix_vehicles_last_camera_id'), table_name='vehicles')
    op.drop_table('vehicles')
    op.drop_index(op.f('ix_traffic_zones_camera_id'), table_name='traffic_zones')
    op.drop_table('traffic_zones')
    op.drop_index(op.f('ix_traffic_stats_hourly_hour_bucket'), table_name='traffic_stats_hourly')
    op.drop_table('traffic_stats_hourly')
    op.drop_index(op.f('ix_traffic_lights_location_id'), table_name='traffic_lights')
    op.drop_index(op.f('ix_traffic_lights_camera_id'), table_name='traffic_lights')
    op.drop_table('traffic_lights')
    op.drop_index('ix_camera_health_logs_camera_recorded', table_name='camera_health_logs')
    op.drop_table('camera_health_logs')
    op.drop_index('uq_camera_connections_primary', table_name='camera_connections', postgresql_where=sa.text('is_primary'))
    op.drop_index(op.f('ix_camera_connections_camera_id'), table_name='camera_connections')
    op.drop_table('camera_connections')
    op.drop_index(op.f('ix_camera_availability_daily_day'), table_name='camera_availability_daily')
    op.drop_table('camera_availability_daily')
    op.drop_index('ix_ai_detection_logs_camera_window', table_name='ai_detection_logs')
    op.drop_index(op.f('ix_ai_detection_logs_ai_model_id'), table_name='ai_detection_logs')
    op.drop_table('ai_detection_logs')
    op.drop_index(op.f('ix_user_sessions_user_id'), table_name='user_sessions')
    op.drop_index(op.f('ix_user_sessions_family_id'), table_name='user_sessions')
    op.drop_index(op.f('ix_user_sessions_expires_at'), table_name='user_sessions')
    op.drop_table('user_sessions')
    op.drop_table('system_settings')
    op.drop_index(op.f('ix_reports_status'), table_name='reports')
    op.drop_index('ix_reports_created_by_created', table_name='reports')
    op.drop_table('reports')
    op.drop_index(op.f('ix_password_reset_tokens_user_id'), table_name='password_reset_tokens')
    op.drop_table('password_reset_tokens')
    op.drop_index('ix_notifications_user_state_created', table_name='notifications')
    op.drop_table('notifications')
    op.drop_index(op.f('ix_cameras_status'), table_name='cameras')
    op.drop_index(op.f('ix_cameras_location_id'), table_name='cameras')
    op.drop_index(op.f('ix_cameras_last_heartbeat_at'), table_name='cameras')
    op.drop_index(op.f('ix_cameras_deleted_at'), table_name='cameras')
    op.drop_index(op.f('ix_cameras_ai_model_id'), table_name='cameras')
    op.drop_table('cameras')
    op.drop_index('ix_audit_logs_user_created', table_name='audit_logs')
    op.drop_index('ix_audit_logs_entity', table_name='audit_logs')
    op.drop_index('ix_audit_logs_created_at', table_name='audit_logs')
    op.drop_index('ix_audit_logs_action_created', table_name='audit_logs')
    op.drop_table('audit_logs')
    op.drop_index('uq_users_username_active', table_name='users', postgresql_where=sa.text('deleted_at IS NULL'))
    op.drop_index('uq_users_email_active', table_name='users', postgresql_where=sa.text('deleted_at IS NULL'))
    op.drop_index(op.f('ix_users_status'), table_name='users')
    op.drop_index(op.f('ix_users_role_id'), table_name='users')
    op.drop_index(op.f('ix_users_deleted_at'), table_name='users')
    op.drop_table('users')
    op.drop_index(op.f('ix_role_permissions_permission_id'), table_name='role_permissions')
    op.drop_table('role_permissions')
    op.drop_index(op.f('ix_locations_district_id'), table_name='locations')
    op.drop_table('locations')
    op.drop_table('violation_types')
    op.drop_table('vehicle_types')
    op.drop_index('ix_system_logs_source_created', table_name='system_logs')
    op.drop_index('ix_system_logs_level_created', table_name='system_logs')
    op.drop_table('system_logs')
    op.drop_table('roles')
    op.drop_index(op.f('ix_permissions_module'), table_name='permissions')
    op.drop_table('permissions')
    op.drop_table('districts')
    op.drop_table('ai_models')
