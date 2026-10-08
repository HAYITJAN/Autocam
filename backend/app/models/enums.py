from enum import StrEnum


class UserStatus(StrEnum):
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"
    BLOCKED = "BLOCKED"


class LocationType(StrEnum):
    INTERSECTION = "INTERSECTION"
    STREET = "STREET"
    HIGHWAY = "HIGHWAY"
    PARKING = "PARKING"


class CameraType(StrEnum):
    FIXED = "FIXED"
    PTZ = "PTZ"
    ANPR = "ANPR"
    SPEED = "SPEED"


class CameraStatus(StrEnum):
    ONLINE = "ONLINE"
    OFFLINE = "OFFLINE"
    WARNING = "WARNING"
    MAINTENANCE = "MAINTENANCE"


class ConnectionType(StrEnum):
    WIFI = "WIFI"
    LTE_4G = "LTE_4G"
    ETHERNET = "ETHERNET"


class ConnectionStatus(StrEnum):
    CONNECTED = "CONNECTED"
    DEGRADED = "DEGRADED"
    DISCONNECTED = "DISCONNECTED"


class NetworkEvent(StrEnum):
    CONNECTED = "CONNECTED"
    DISCONNECTED = "DISCONNECTED"
    DEGRADED = "DEGRADED"
    RECOVERED = "RECOVERED"
    SWITCHED = "SWITCHED"


class ZoneType(StrEnum):
    STOP_LINE = "STOP_LINE"
    PARKING_RESTRICTED = "PARKING_RESTRICTED"
    LANE_DIRECTION = "LANE_DIRECTION"
    SPEED_TRAP = "SPEED_TRAP"
    DETECTION_AREA = "DETECTION_AREA"


class TrafficLightSource(StrEnum):
    CONTROLLER = "CONTROLLER"
    VISION = "VISION"
    SIMULATED = "SIMULATED"


class TrafficLightState(StrEnum):
    RED = "RED"
    YELLOW = "YELLOW"
    GREEN = "GREEN"
    UNKNOWN = "UNKNOWN"


class VehicleStatus(StrEnum):
    NORMAL = "NORMAL"
    WATCHLIST = "WATCHLIST"
    BLACKLIST = "BLACKLIST"


class AIModelTask(StrEnum):
    VEHICLE_DETECTION = "VEHICLE_DETECTION"
    PLATE_DETECTION = "PLATE_DETECTION"
    PLATE_OCR = "PLATE_OCR"


class Severity(StrEnum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class ViolationStatus(StrEnum):
    NEW = "NEW"
    UNDER_REVIEW = "UNDER_REVIEW"
    CONFIRMED = "CONFIRMED"
    REJECTED = "REJECTED"
    ARCHIVED = "ARCHIVED"


class EvidenceType(StrEnum):
    IMAGE_MAIN = "IMAGE_MAIN"
    IMAGE_BEFORE = "IMAGE_BEFORE"
    IMAGE_AFTER = "IMAGE_AFTER"
    VIDEO_CLIP = "VIDEO_CLIP"
    PLATE_CROP = "PLATE_CROP"
    VEHICLE_CROP = "VEHICLE_CROP"
    DETECTION_FRAME = "DETECTION_FRAME"


class ViolationEventType(StrEnum):
    CREATED = "CREATED"
    STATUS_CHANGED = "STATUS_CHANGED"
    ASSIGNED = "ASSIGNED"
    COMMENT = "COMMENT"
    EXPORTED = "EXPORTED"
    REPORT_GENERATED = "REPORT_GENERATED"


class NotificationType(StrEnum):
    CRITICAL = "CRITICAL"
    WARNING = "WARNING"
    INFO = "INFO"
    SYSTEM = "SYSTEM"
    VIOLATION = "VIOLATION"


class NotificationState(StrEnum):
    UNREAD = "UNREAD"
    READ = "READ"
    ARCHIVED = "ARCHIVED"


class ReportType(StrEnum):
    DAILY = "DAILY"
    WEEKLY = "WEEKLY"
    MONTHLY = "MONTHLY"
    VIOLATION = "VIOLATION"
    CAMERA = "CAMERA"
    VEHICLE = "VEHICLE"
    AI_PERFORMANCE = "AI_PERFORMANCE"
    SYSTEM = "SYSTEM"


class ReportFormat(StrEnum):
    PDF = "PDF"
    XLSX = "XLSX"
    CSV = "CSV"


class ReportStatus(StrEnum):
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class LogLevel(StrEnum):
    DEBUG = "DEBUG"
    INFO = "INFO"
    WARNING = "WARNING"
    ERROR = "ERROR"
    CRITICAL = "CRITICAL"
