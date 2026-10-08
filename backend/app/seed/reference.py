"""Static reference data loaded by the base seed (see docs/DATABASE.md §6)."""

from dataclasses import dataclass, field
from typing import Any

from app.models.enums import AIModelTask, LocationType, Severity

ADMIN_ROLE = "ADMINISTRATOR"

# (code, module, name)
PERMISSIONS: tuple[tuple[str, str, str], ...] = (
    ("dashboard.view", "dashboard", "Boshqaruv panelini ko‘rish"),
    ("monitoring.view", "monitoring", "Jonli monitoringni ko‘rish"),
    ("cameras.view", "cameras", "Kameralarni ko‘rish"),
    ("cameras.create", "cameras", "Kamera qo‘shish"),
    ("cameras.update", "cameras", "Kamerani tahrirlash"),
    ("cameras.delete", "cameras", "Kamerani o‘chirish"),
    ("violations.view", "violations", "Qoidabuzarliklarni ko‘rish"),
    ("violations.review", "violations", "Qoidabuzarlikni ko‘rib chiqish"),
    ("violations.confirm", "violations", "Qoidabuzarlikni tasdiqlash"),
    ("violations.reject", "violations", "Qoidabuzarlikni rad etish"),
    ("vehicles.view", "vehicles", "Transport vositalarini ko‘rish"),
    ("analytics.view", "analytics", "Analitikani ko‘rish"),
    ("reports.view", "reports", "Hisobotlarni ko‘rish"),
    ("reports.create", "reports", "Hisobot yaratish"),
    ("users.view", "users", "Foydalanuvchilarni ko‘rish"),
    ("users.create", "users", "Foydalanuvchi qo‘shish"),
    ("users.update", "users", "Foydalanuvchini tahrirlash"),
    ("users.delete", "users", "Foydalanuvchini o‘chirish"),
    ("settings.view", "settings", "Sozlamalarni ko‘rish"),
    ("settings.update", "settings", "Sozlamalarni o‘zgartirish"),
    ("system_logs.view", "system_logs", "Tizim jurnallarini ko‘rish"),
)

# (code, name, description)
ROLES: tuple[tuple[str, str, str], ...] = (
    (ADMIN_ROLE, "Administrator", "Tizimga to‘liq kirish huquqi"),
    ("SUPERVISOR", "Nazoratchi", "Operatorlar ishini nazorat qiladi"),
    ("OPERATOR", "Operator", "Qoidabuzarliklarni ko‘rib chiqadi"),
    ("ANALYST", "Tahlilchi", "Analitika va hisobotlar bilan ishlaydi"),
    ("VIEWER", "Kuzatuvchi", "Faqat ko‘rish huquqi"),
)

_EVERYONE_VIEW = (
    "dashboard.view",
    "monitoring.view",
    "cameras.view",
    "violations.view",
    "vehicles.view",
    "reports.view",
)
_REVIEW = ("violations.review", "violations.confirm", "violations.reject")

ROLE_PERMISSIONS: dict[str, frozenset[str]] = {
    ADMIN_ROLE: frozenset(code for code, _, _ in PERMISSIONS),
    "SUPERVISOR": frozenset(
        (
            *_EVERYONE_VIEW,
            *_REVIEW,
            "cameras.update",
            "analytics.view",
            "reports.create",
            "users.view",
            "settings.view",
            "system_logs.view",
        )
    ),
    "OPERATOR": frozenset((*_EVERYONE_VIEW, *_REVIEW)),
    "ANALYST": frozenset((*_EVERYONE_VIEW, "analytics.view", "reports.create")),
    "VIEWER": frozenset((*_EVERYONE_VIEW, "analytics.view")),
}


@dataclass(frozen=True, slots=True)
class DistrictSeed:
    code: str
    name: str
    lat: float
    lng: float


DISTRICTS: tuple[DistrictSeed, ...] = (
    DistrictSeed("BEKTEMIR", "Bektemir tumani", 41.2090, 69.3340),
    DistrictSeed("CHILONZOR", "Chilonzor tumani", 41.2756, 69.2034),
    DistrictSeed("MIROBOD", "Mirobod tumani", 41.2870, 69.2730),
    DistrictSeed("MIRZO_ULUGBEK", "Mirzo Ulug‘bek tumani", 41.3380, 69.3350),
    DistrictSeed("OLMAZOR", "Olmazor tumani", 41.3500, 69.2150),
    DistrictSeed("SERGELI", "Sergeli tumani", 41.2270, 69.2190),
    DistrictSeed("SHAYXONTOHUR", "Shayxontohur tumani", 41.3260, 69.2280),
    DistrictSeed("UCHTEPA", "Uchtepa tumani", 41.2900, 69.1700),
    DistrictSeed("YAKKASAROY", "Yakkasaroy tumani", 41.2830, 69.2510),
    DistrictSeed("YANGIHAYOT", "Yangihayot tumani", 41.2050, 69.1900),
    DistrictSeed("YASHNOBOD", "Yashnobod tumani", 41.2930, 69.3400),
    DistrictSeed("YUNUSOBOD", "Yunusobod tumani", 41.3640, 69.2860),
)


@dataclass(frozen=True, slots=True)
class LocationSeed:
    district: str
    name: str
    lat: float
    lng: float
    location_type: LocationType = LocationType.INTERSECTION
    address: str | None = None


_I = LocationType.INTERSECTION
_S = LocationType.STREET
_H = LocationType.HIGHWAY

LOCATIONS: tuple[LocationSeed, ...] = (
    LocationSeed("YUNUSOBOD", "Amir Temur — Shahrisabz chorrahasi", 41.3160, 69.2790),
    LocationSeed("YUNUSOBOD", "Yunusobod bozori chorrahasi", 41.3640, 69.2870),
    LocationSeed("YUNUSOBOD", "Bog‘ishamol — Amir Temur chorrahasi", 41.3420, 69.2850),
    LocationSeed("MIRZO_ULUGBEK", "Buyuk Ipak yo‘li chorrahasi", 41.3260, 69.3290),
    LocationSeed("MIRZO_ULUGBEK", "Mirzo Ulug‘bek — Parkent chorrahasi", 41.3200, 69.3300),
    LocationSeed("MIRZO_ULUGBEK", "Qorasuv chorrahasi", 41.3460, 69.3600),
    LocationSeed("MIROBOD", "Oybek chorrahasi", 41.2990, 69.2700),
    LocationSeed("MIROBOD", "Mirobod — Shota Rustaveli chorrahasi", 41.2960, 69.2800),
    LocationSeed("MIROBOD", "Toshkent vokzali oldi", 41.2920, 69.2880, _S),
    LocationSeed("YAKKASAROY", "Bobur — Shota Rustaveli chorrahasi", 41.2850, 69.2550),
    LocationSeed("YAKKASAROY", "Kichik halqa yo‘li — Bobur", 41.2770, 69.2500, _H),
    LocationSeed("CHILONZOR", "Bunyodkor — Chilonzor chorrahasi", 41.2750, 69.2040),
    LocationSeed("CHILONZOR", "Novza chorrahasi", 41.2930, 69.2230),
    LocationSeed("CHILONZOR", "Muqimiy — Bunyodkor chorrahasi", 41.2860, 69.2250),
    LocationSeed("SHAYXONTOHUR", "Chorsu chorrahasi", 41.3260, 69.2360),
    LocationSeed("SHAYXONTOHUR", "Navoiy — Furqat chorrahasi", 41.3150, 69.2500),
    LocationSeed("SHAYXONTOHUR", "Paxtakor chorrahasi", 41.3165, 69.2675),
    LocationSeed("OLMAZOR", "Beruniy — Qorasaroy chorrahasi", 41.3450, 69.2110),
    LocationSeed("OLMAZOR", "Farobiy chorrahasi", 41.3550, 69.2200),
    LocationSeed("OLMAZOR", "Olmazor — Kichik halqa yo‘li", 41.3410, 69.2280, _H),
    LocationSeed("UCHTEPA", "Lutfiy — Farhod chorrahasi", 41.2950, 69.1800),
    LocationSeed("UCHTEPA", "Uchtepa savdo markazi oldi", 41.2880, 69.1720, _S),
    LocationSeed("YASHNOBOD", "Tuzel chorrahasi", 41.2890, 69.3550),
    LocationSeed("YASHNOBOD", "Maxtumquli — Aviasozlar chorrahasi", 41.2900, 69.3300),
    LocationSeed("SERGELI", "Sergeli bozori chorrahasi", 41.2270, 69.2190),
    LocationSeed("SERGELI", "Yangi Sergeli yo‘li", 41.2180, 69.2350, _H),
    LocationSeed("BEKTEMIR", "Bektemir — Katta halqa yo‘li", 41.2090, 69.3340, _H),
    LocationSeed("BEKTEMIR", "Husayn Boyqaro ko‘chasi", 41.2200, 69.3200, _S),
    LocationSeed("YANGIHAYOT", "Yangihayot sanoat zonasi chorrahasi", 41.2050, 69.1900),
    LocationSeed("YANGIHAYOT", "Chuqursoy chorrahasi", 41.2350, 69.1700),
)

CAMERA_COUNT = 45

# (code, name_uz, name_en, color, icon)
VEHICLE_TYPES: tuple[tuple[str, str, str, str, str], ...] = (
    ("CAR", "Yengil avtomobil", "Car", "#3B82F6", "car"),
    ("TRUCK", "Yuk mashinasi", "Truck", "#F59E0B", "truck"),
    ("BUS", "Avtobus", "Bus", "#10B981", "bus"),
    ("MOTORCYCLE", "Mototsikl", "Motorcycle", "#8B5CF6", "bike"),
    ("OTHER", "Boshqa", "Other", "#6B7280", "circle-help"),
)


@dataclass(frozen=True, slots=True)
class ViolationTypeSeed:
    code: str
    name_uz: str
    name_en: str
    severity: Severity
    color: str
    icon: str
    rule_params: dict[str, Any] = field(default_factory=dict)
    is_active: bool = True


VIOLATION_TYPES: tuple[ViolationTypeSeed, ...] = (
    ViolationTypeSeed(
        "RED_LIGHT",
        "Qizil chiroqda o‘tish",
        "Red light",
        Severity.HIGH,
        "#EF4444",
        "traffic-cone",
        {"min_confidence": 0.6, "grace_ms": 300},
    ),
    ViolationTypeSeed(
        "SPEEDING",
        "Tezlikni oshirish",
        "Speeding",
        Severity.MEDIUM,
        "#F97316",
        "gauge",
        {"min_confidence": 0.6, "tolerance_kmh": 10},
    ),
    ViolationTypeSeed(
        "ILLEGAL_PARKING",
        "Noto‘g‘ri to‘xtash",
        "Illegal parking",
        Severity.LOW,
        "#EAB308",
        "square-parking",
        {"min_confidence": 0.6, "dwell_seconds": 60},
    ),
    ViolationTypeSeed(
        "WRONG_DIRECTION",
        "Teskari yo‘nalishda harakatlanish",
        "Wrong direction",
        Severity.CRITICAL,
        "#DC2626",
        "arrow-left-right",
        {"min_confidence": 0.6, "angle_tolerance_deg": 60, "min_track_seconds": 2},
    ),
    ViolationTypeSeed(
        "STOP_LINE",
        "To‘xtash chizig‘ini kesib o‘tish",
        "Stop line crossing",
        Severity.MEDIUM,
        "#A855F7",
        "octagon-alert",
        {"min_confidence": 0.6},
    ),
    ViolationTypeSeed(
        "LANE_VIOLATION",
        "Tasma qoidasini buzish",
        "Lane violation",
        Severity.LOW,
        "#0EA5E9",
        "split",
        is_active=False,
    ),
    ViolationTypeSeed(
        "NO_SEATBELT",
        "Xavfsizlik kamarisiz",
        "No seatbelt",
        Severity.LOW,
        "#64748B",
        "user-x",
        is_active=False,
    ),
)


@dataclass(frozen=True, slots=True)
class AIModelSeed:
    name: str
    version: str
    framework: str
    task: AIModelTask
    weights_uri: str
    description: str
    is_active: bool


AI_MODELS: tuple[AIModelSeed, ...] = (
    AIModelSeed(
        "yolov8n-vehicles",
        "1.0",
        "onnx",
        AIModelTask.VEHICLE_DETECTION,
        "models/yolov8n-vehicles.onnx",
        "COCO vehicle classes (car, truck, bus, motorcycle)",
        True,
    ),
    AIModelSeed(
        "uz-lpr",
        "1.0",
        "onnx",
        AIModelTask.PLATE_OCR,
        "models/uz-lpr.onnx",
        "Uzbekistan licence plate recognition",
        False,
    ),
)

# key -> (value, description). Inserted only when missing so admin edits survive re-seeding.
SYSTEM_SETTINGS: dict[str, tuple[Any, str]] = {
    "heartbeat.timeout_seconds": (30, "Kamera OFFLINE deb belgilanadigan heartbeat kutish vaqti"),
    "camera.warning_thresholds": (
        {"fps_min": 15, "latency_ms_max": 500, "packet_loss_pct_max": 5, "temperature_c_max": 70},
        "Kamera WARNING holatiga o‘tish chegaralari",
    ),
    "retention.health_logs_days": (90, "Kamera sog‘liq jurnallarini saqlash muddati (kun)"),
    "retention.detections_days": (90, "Aniqlash yozuvlarini saqlash muddati (kun)"),
    "retention.confirmed_evidence_days": (1825, "Tasdiqlangan dalillarni saqlash muddati (kun)"),
    "notifications.routing": (
        {"NEW_VIOLATION": "violations.review", "CAMERA_OFFLINE": "settings.view"},
        "Bildirishnoma turini qabul qiluvchi ruxsatnoma",
    ),
    "map.defaults": ({"center": [41.3111, 69.2797], "zoom": 12}, "Xarita boshlang‘ich holati"),
    "demo.enabled": (False, "Demo ma’lumotlar yuklanganmi"),
}
