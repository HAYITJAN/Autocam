"""Importing this package registers every model on `Base.metadata` (used by Alembic)."""

from app.models.ai import AIDetectionLog, AIModel
from app.models.analytics import CameraAvailabilityDaily, TrafficStatsHourly, ViolationStatsHourly
from app.models.camera import (
    Camera,
    CameraConnection,
    CameraHealthLog,
    NetworkLog,
    TrafficLight,
    TrafficZone,
)
from app.models.geo import District, Location
from app.models.log import AuditLog, SystemLog
from app.models.notification import Notification
from app.models.report import Report
from app.models.settings import SystemSetting
from app.models.user import (
    PasswordResetToken,
    Permission,
    Role,
    User,
    UserSession,
    role_permissions,
)
from app.models.vehicle import Vehicle, VehicleDetection, VehicleType
from app.models.violation import Violation, ViolationEvent, ViolationEvidence, ViolationType

__all__ = [
    "AIDetectionLog",
    "AIModel",
    "AuditLog",
    "Camera",
    "CameraAvailabilityDaily",
    "CameraConnection",
    "CameraHealthLog",
    "District",
    "Location",
    "NetworkLog",
    "Notification",
    "PasswordResetToken",
    "Permission",
    "Report",
    "Role",
    "SystemLog",
    "SystemSetting",
    "TrafficLight",
    "TrafficStatsHourly",
    "TrafficZone",
    "User",
    "UserSession",
    "Vehicle",
    "VehicleDetection",
    "VehicleType",
    "Violation",
    "ViolationEvent",
    "ViolationEvidence",
    "ViolationStatsHourly",
    "ViolationType",
    "role_permissions",
]
