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
    """A point on a real road (snapped to OpenStreetMap road geometry).

    `alt` is a second mounting point ~35 m along the main road, used by the
    camera watching the opposite direction at the same location.
    """

    district: str
    name: str
    lat: float
    lng: float
    location_type: LocationType = LocationType.INTERSECTION
    address: str | None = None
    alt: tuple[float, float] | None = None


_I = LocationType.INTERSECTION
_S = LocationType.STREET
_H = LocationType.HIGHWAY


def _loc(
    district: str,
    name: str,
    point: tuple[float, float],
    alt: tuple[float, float],
    location_type: LocationType = LocationType.INTERSECTION,
) -> LocationSeed:
    return LocationSeed(district, name, point[0], point[1], location_type, alt=alt)


# Coordinates are road nodes from OpenStreetMap (© OpenStreetMap contributors, ODbL):
# intersections sit on the junction node of the named streets, other locations on the road line.
# fmt: off
LOCATIONS: tuple[LocationSeed, ...] = (
    _loc("YUNUSOBOD", "Amir Temur — Shahrisabz chorrahasi", (41.316688, 69.280849), (41.316378, 69.280779)),
    _loc("YUNUSOBOD", "Yunusobod bozori chorrahasi", (41.364547, 69.287173), (41.364273, 69.287378)),
    _loc("YUNUSOBOD", "Bog‘ishamol — Amir Temur chorrahasi", (41.339736, 69.285529), (41.340047, 69.285587)),
    _loc("MIRZO_ULUGBEK", "Buyuk Ipak yo‘li chorrahasi", (41.326208, 69.329102), (41.326152, 69.328690)),
    _loc("MIRZO_ULUGBEK", "Mirzo Ulug‘bek — Parkent chorrahasi", (41.314766, 69.328560), (41.314637, 69.328941)),
    _loc("MIRZO_ULUGBEK", "Qorasuv chorrahasi", (41.342947, 69.365114), (41.343142, 69.364786)),
    _loc("MIROBOD", "Oybek chorrahasi", (41.298762, 69.273186), (41.298517, 69.273449)),
    _loc("MIROBOD", "Mirobod — Shota Rustaveli chorrahasi", (41.294966, 69.283241), (41.294765, 69.282918)),
    _loc("MIROBOD", "Toshkent vokzali oldi", (41.292643, 69.287594), (41.292845, 69.287915), _S),
    _loc("YAKKASAROY", "Bobur — Shota Rustaveli chorrahasi", (41.285299, 69.253756), (41.285542, 69.254023)),
    _loc("YAKKASAROY", "Kichik halqa yo‘li — Bobur", (41.278864, 69.249149), (41.278756, 69.248756), _H),
    _loc("CHILONZOR", "Bunyodkor — Chilonzor chorrahasi", (41.274755, 69.204515), (41.274961, 69.204199)),
    _loc("CHILONZOR", "Novza chorrahasi", (41.292431, 69.222919), (41.292226, 69.223237)),
    _loc("CHILONZOR", "Muqimiy — Bunyodkor chorrahasi", (41.291630, 69.223810), (41.291428, 69.224132)),
    _loc("SHAYXONTOHUR", "Chorsu chorrahasi", (41.322408, 69.236440), (41.322327, 69.236842)),
    _loc("SHAYXONTOHUR", "Navoiy — Furqat chorrahasi", (41.311451, 69.253278), (41.311468, 69.252860)),
    _loc("SHAYXONTOHUR", "Paxtakor chorrahasi", (41.315937, 69.270374), (41.315640, 69.270239)),
    _loc("OLMAZOR", "Beruniy — Qorasaroy chorrahasi", (41.345070, 69.207056), (41.345245, 69.206710)),
    _loc("OLMAZOR", "Farobiy chorrahasi", (41.355450, 69.219423), (41.355613, 69.219065)),
    _loc("OLMAZOR", "Olmazor — Kichik halqa yo‘li", (41.340274, 69.228559), (41.340121, 69.228193), _H),
    _loc("UCHTEPA", "Lutfiy — Farhod chorrahasi", (41.291914, 69.179054), (41.291760, 69.179176)),
    _loc("UCHTEPA", "Uchtepa savdo markazi oldi", (41.287996, 69.172006), (41.287701, 69.171862), _S),
    _loc("YASHNOBOD", "Tuzel chorrahasi", (41.290911, 69.357700), (41.290657, 69.357946)),
    _loc("YASHNOBOD", "Maxtumquli — Aviasozlar chorrahasi", (41.293754, 69.336258), (41.293515, 69.336508)),
    _loc("SERGELI", "Sergeli bozori chorrahasi", (41.226962, 69.219665), (41.227247, 69.219487)),
    _loc("SERGELI", "Yangi Sergeli yo‘li", (41.217378, 69.234140), (41.217101, 69.234340), _H),
    _loc("BEKTEMIR", "Bektemir — Katta halqa yo‘li", (41.209056, 69.333582), (41.209369, 69.333624), _H),
    _loc("BEKTEMIR", "Husayn Boyqaro ko‘chasi", (41.223988, 69.319943), (41.224204, 69.320227), _S),
    _loc("YANGIHAYOT", "Yangihayot sanoat zonasi chorrahasi", (41.206494, 69.191925), (41.206236, 69.192164)),
    _loc("YANGIHAYOT", "Chuqursoy chorrahasi", (41.235872, 69.164736), (41.236092, 69.165034)),
)
# fmt: on

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
    description: str | None = None


VIOLATION_TYPES: tuple[ViolationTypeSeed, ...] = (
    ViolationTypeSeed(
        "RED_LIGHT",
        "Qizil chiroqda o‘tish",
        "Red light",
        Severity.HIGH,
        "#EF4444",
        "traffic-cone",
        {"min_confidence": 0.6, "grace_ms": 300},
        description="Svetoforning qizil ishorasida to‘xtash chizig‘ini kesib o‘tish.",
    ),
    ViolationTypeSeed(
        "SPEEDING",
        "Tezlikni oshirish",
        "Speeding",
        Severity.MEDIUM,
        "#F97316",
        "gauge",
        {"min_confidence": 0.6, "tolerance_kmh": 10},
        description="Ruxsat etilgan tezlikni belgilangan chegaradan ortiq oshirish.",
    ),
    ViolationTypeSeed(
        "ILLEGAL_PARKING",
        "Noto‘g‘ri to‘xtash",
        "Illegal parking",
        Severity.LOW,
        "#EAB308",
        "square-parking",
        {"min_confidence": 0.6, "dwell_seconds": 60},
        description="To‘xtash taqiqlangan hududda belgilangan vaqtdan uzoq turish.",
    ),
    ViolationTypeSeed(
        "WRONG_DIRECTION",
        "Teskari yo‘nalishda harakatlanish",
        "Wrong direction",
        Severity.CRITICAL,
        "#DC2626",
        "arrow-left-right",
        {"min_confidence": 0.6, "angle_tolerance_deg": 60, "min_track_seconds": 2},
        description="Bir tomonlama yoki ajratilgan yo‘lda qarama-qarshi yo‘nalishda harakat.",
    ),
    ViolationTypeSeed(
        "STOP_LINE",
        "To‘xtash chizig‘ini kesib o‘tish",
        "Stop line crossing",
        Severity.MEDIUM,
        "#A855F7",
        "octagon-alert",
        {"min_confidence": 0.6},
        description="Taqiqlovchi ishorada to‘xtash chizig‘idan o‘tib to‘xtash.",
    ),
    ViolationTypeSeed(
        "LANE_VIOLATION",
        "Tasma qoidasini buzish",
        "Lane violation",
        Severity.LOW,
        "#0EA5E9",
        "split",
        is_active=False,
        description="Yo‘l chiziqlari va harakat tasmalari qoidalarini buzish.",
    ),
    ViolationTypeSeed(
        "NO_SEATBELT",
        "Xavfsizlik kamarisiz",
        "No seatbelt",
        Severity.LOW,
        "#64748B",
        "user-x",
        is_active=False,
        description="Haydovchi yoki yo‘lovchi xavfsizlik kamarini taqmagan.",
    ),
    ViolationTypeSeed(
        "PHONE_USAGE",
        "Telefondan foydalanish",
        "Phone usage",
        Severity.MEDIUM,
        "#14B8A6",
        "smartphone",
        is_active=False,
        description="Harakat vaqtida qo‘lda telefon ushlab gaplashish yoki foydalanish.",
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
