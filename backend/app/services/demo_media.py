"""Deterministic SVG stand-ins for evidence of demo violations (`storage_backend = "demo"`).

Demo databases have no camera footage, so evidence rows point at this renderer instead
of a stored file. The output depends only on immutable violation facts, which keeps the
recorded sha256/size of each evidence row valid. Never used for real evidence.
"""

import random
from dataclasses import dataclass
from datetime import datetime, tzinfo
from html import escape

from app.models.enums import EvidenceType

SVG_MIME = "image/svg+xml"
FRAME = (1280, 720)
SIZES: dict[EvidenceType, tuple[int, int]] = {
    EvidenceType.IMAGE_MAIN: FRAME,
    EvidenceType.IMAGE_BEFORE: FRAME,
    EvidenceType.IMAGE_AFTER: FRAME,
    EvidenceType.DETECTION_FRAME: FRAME,
    EvidenceType.VEHICLE_CROP: (640, 420),
    EvidenceType.PLATE_CROP: (520, 140),
}
VEHICLE_COLORS = {
    "Oq": "#ecebe6",
    "Qora": "#1f2023",
    "Kumush": "#c3c6cb",
    "Kulrang": "#7b8087",
    "Ko‘k": "#2f5fb3",
    "Qizil": "#b8383a",
    "Jigarrang": "#6b4a35",
}
ACCENT = "#7fdd5c"
ALERT = "#f0566a"
FONT = "Inter, Segoe UI, Arial, sans-serif"
MONO = "Consolas, DejaVu Sans Mono, monospace"
STOP_LINE_TYPES = frozenset({"RED_LIGHT", "STOP_LINE"})


@dataclass(frozen=True, slots=True)
class DemoScene:
    violation_id: int
    violation_code: str
    type_code: str
    type_name: str
    camera_code: str
    camera_name: str
    plate_display: str | None
    vehicle_label: str | None
    vehicle_color: str | None
    vehicle_type: str | None
    detected_speed: float | None
    speed_limit: float | None


def supported(evidence_type: EvidenceType) -> bool:
    return evidence_type in SIZES


def vehicle_label(brand: str | None, model: str | None) -> str | None:
    return " ".join(p for p in (brand, model) if p) or None


def render(
    evidence_type: EvidenceType, scene: DemoScene, captured_at: datetime, tz: tzinfo
) -> bytes:
    width, height = SIZES[evidence_type]
    if evidence_type is EvidenceType.PLATE_CROP:
        body = _plate_crop(scene, width, height)
    elif evidence_type is EvidenceType.VEHICLE_CROP:
        body = _vehicle_crop(scene, width, height)
    else:
        body = _frame(scene, evidence_type, captured_at.astimezone(tz))
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
        f'viewBox="0 0 {width} {height}" font-family="{FONT}">{body}</svg>'
    )
    return svg.encode()


def _paint(scene: DemoScene) -> str:
    return VEHICLE_COLORS.get(scene.vehicle_color or "", "#9aa0a6")


def _vehicle(scene: DemoScene, cx: float, base: float, scale: float, plate_text: bool) -> str:
    paint = _paint(scene)
    plate = escape(scene.plate_display or "—")
    heavy = scene.vehicle_type in {"TRUCK", "BUS"}
    top = -200 if heavy else -95
    body = (
        f'<rect x="-118" y="{top}" width="236" height="{-top - 22}" rx="{10 if heavy else 18}" '
        f'fill="{paint}"/>'
    )
    if heavy:
        cabin = (
            '<rect x="-104" y="-188" width="208" height="58" rx="6" fill="#22272e" opacity="0.9"/>'
            '<rect x="-118" y="-118" width="236" height="6" fill="#000" opacity="0.18"/>'
        )
    else:
        cabin = (
            f'<path d="M-82 -95 L-60 -148 L60 -148 L82 -95 Z" fill="{paint}"/>'
            '<path d="M-82 -95 L-60 -148 L60 -148 L82 -95 Z" fill="#000" opacity="0.12"/>'
            '<path d="M-68 -100 L-51 -140 L51 -140 L68 -100 Z" fill="#22272e" opacity="0.92"/>'
        )
    label = (
        f'<text x="0" y="-47" font-family="{MONO}" font-size="11.5" font-weight="700" '
        f'text-anchor="middle" fill="#111">{plate}</text>'
        if plate_text
        else ""
    )
    return (
        f'<g transform="translate({cx:.1f} {base:.1f}) scale({scale:.3f})">'
        '<ellipse cx="0" cy="-4" rx="128" ry="13" fill="#000" opacity="0.35"/>'
        '<rect x="-108" y="-36" width="34" height="34" rx="6" fill="#111"/>'
        '<rect x="74" y="-36" width="34" height="34" rx="6" fill="#111"/>'
        f"{body}{cabin}"
        '<rect x="-110" y="-84" width="36" height="12" rx="3" fill="#d23c3c"/>'
        '<rect x="74" y="-84" width="36" height="12" rx="3" fill="#d23c3c"/>'
        '<rect x="-118" y="-42" width="236" height="8" fill="#000" opacity="0.22"/>'
        '<rect x="-38" y="-62" width="76" height="21" rx="3" fill="#f4f4f0" stroke="#222"/>'
        f"{label}</g>"
    )


def _street(rng: random.Random, light_red: bool, stop_line: bool) -> str:
    buildings = "".join(
        f'<rect x="{x}" y="{300 - h}" width="{w}" height="{h}" fill="#2c3036" opacity="{o:.2f}"/>'
        for x, w, h, o in (
            (
                rng.randint(-20, 1200),
                rng.randint(60, 160),
                rng.randint(60, 190),
                rng.uniform(0.6, 1),
            )
            for _ in range(14)
        )
    )
    light = ALERT if light_red else ACCENT
    return (
        '<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">'
        '<stop offset="0" stop-color="#3b4048"/><stop offset="1" stop-color="#5a6069"/>'
        '</linearGradient><linearGradient id="road" x1="0" y1="0" x2="0" y2="1">'
        '<stop offset="0" stop-color="#43464c"/><stop offset="1" stop-color="#2a2c30"/>'
        "</linearGradient></defs>"
        '<rect width="1280" height="720" fill="url(#sky)"/>'
        f"{buildings}"
        '<polygon points="420,300 860,300 1380,720 -100,720" fill="url(#road)"/>'
        '<polygon points="380,300 420,300 -100,720 -260,720" fill="#55595f"/>'
        '<polygon points="860,300 900,300 1540,720 1380,720" fill="#55595f"/>'
        '<line x1="640" y1="300" x2="640" y2="720" stroke="#d9d9d4" stroke-width="5" '
        'stroke-dasharray="26 22" opacity="0.75"/>'
        '<line x1="530" y1="300" x2="213" y2="720" stroke="#d9d9d4" stroke-width="4" '
        'stroke-dasharray="26 22" opacity="0.55"/>'
        '<line x1="750" y1="300" x2="1067" y2="720" stroke="#d9d9d4" stroke-width="4" '
        'stroke-dasharray="26 22" opacity="0.55"/>'
        + (
            '<polygon points="160,548 1120,548 1134,562 146,562" fill="#f1f1ec" opacity="0.92"/>'
            if stop_line
            else ""
        )
        + '<rect x="1112" y="96" width="10" height="330" fill="#1b1d20"/>'
        '<rect x="1088" y="96" width="58" height="150" rx="10" fill="#15171a"/>'
        f'<circle cx="1117" cy="128" r="16" fill="{ALERT if light_red else "#3a2326"}"/>'
        '<circle cx="1117" cy="171" r="16" fill="#3b3420"/>'
        f'<circle cx="1117" cy="214" r="16" fill="{"#21361d" if light_red else light}"/>'
    )


def _hud(scene: DemoScene, local: datetime, caption: str) -> str:
    stamp = local.strftime("%Y-%m-%d %H:%M:%S") + f".{local.microsecond // 1000:03d}"
    camera = escape(f"{scene.camera_code} • {scene.camera_name}")
    speed = ""
    if scene.detected_speed is not None and scene.speed_limit is not None:
        speed = (
            '<rect x="24" y="612" width="250" height="84" rx="14" fill="#000" opacity="0.6"/>'
            f'<text x="44" y="652" font-size="30" font-weight="700" fill="{ALERT}">'
            f"{scene.detected_speed:.0f} km/soat</text>"
            f'<text x="44" y="680" font-size="15" fill="#d5d5d0">Chegara: '
            f"{scene.speed_limit:.0f} km/soat</text>"
        )
    return (
        '<rect x="24" y="22" width="560" height="74" rx="14" fill="#000" opacity="0.6"/>'
        f'<text x="44" y="53" font-size="19" font-weight="600" fill="#fff">{camera}</text>'
        f'<text x="44" y="80" font-family="{MONO}" font-size="16" fill="#d5d5d0">{stamp}</text>'
        '<rect x="1000" y="22" width="256" height="40" rx="12" fill="#000" opacity="0.6"/>'
        f'<circle cx="1022" cy="42" r="7" fill="{ALERT}"/>'
        f'<text x="1038" y="48" font-size="16" font-weight="600" fill="#fff">'
        f"REC  {escape(scene.violation_code)}</text>"
        f"{speed}"
        '<rect x="884" y="642" width="372" height="54" rx="14" fill="#000" opacity="0.6"/>'
        f'<text x="1236" y="676" font-size="17" font-weight="600" text-anchor="end" '
        f'fill="#fff">{escape(caption)}</text>'
    )


def _frame(scene: DemoScene, evidence_type: EvidenceType, local: datetime) -> str:
    rng = random.Random(scene.violation_id)  # noqa: S311 - deterministic layout, not security
    lane = rng.choice((-1, 0, 1))
    stop_line = scene.type_code in STOP_LINE_TYPES
    before = evidence_type in {EvidenceType.IMAGE_BEFORE}
    after = evidence_type in {EvidenceType.IMAGE_AFTER}
    # Vehicles further up the frame are further away: shrink them along the road.
    base = 690 if before else 470 if after else 590
    if scene.type_code == "ILLEGAL_PARKING":
        lane, base = 2, 640
    scale = 0.35 + (base - 300) / 420 * 0.95
    cx = 640 + lane * 210 * (base - 300) / 420
    vehicle = _vehicle(scene, cx, base, scale, plate_text=True)
    box_w, box_h = 250 * scale, (215 if scene.vehicle_type in {"TRUCK", "BUS"} else 160) * scale
    tag = escape(f"{scene.type_code} • {scene.plate_display or 'raqam o‘qilmadi'}")
    box = (
        f'<rect x="{cx - box_w / 2:.1f}" y="{base - box_h:.1f}" width="{box_w:.1f}" '
        f'height="{box_h:.1f}" fill="none" stroke="{ACCENT}" stroke-width="3" rx="6"/>'
        f'<rect x="{cx - box_w / 2:.1f}" y="{base - box_h - 30:.1f}" width="{max(box_w, 230):.1f}" '
        f'height="26" rx="6" fill="{ACCENT}"/>'
        f'<text x="{cx - box_w / 2 + 10:.1f}" y="{base - box_h - 12:.1f}" font-size="14" '
        f'font-weight="700" fill="#121212">{tag}</text>'
    )
    extra = ""
    if scene.type_code == "WRONG_DIRECTION":
        extra = (
            f'<path d="M560 380 L720 380 M720 380 L690 360 M720 380 L690 400" stroke="{ACCENT}" '
            'stroke-width="6" fill="none" stroke-linecap="round" transform="rotate(-90 640 380)"/>'
            f'<path d="M{cx:.0f} {base - box_h - 50:.0f} l0 -60 m0 60 l-18 -22 m18 22 l18 -22" '
            f'stroke="{ALERT}" stroke-width="6" fill="none" stroke-linecap="round"/>'
        )
    if scene.type_code == "ILLEGAL_PARKING":
        extra = (
            '<rect x="1196" y="300" width="8" height="160" fill="#1b1d20"/>'
            '<circle cx="1200" cy="290" r="34" fill="#2f5fb3" stroke="#d63b3b" stroke-width="8"/>'
            '<line x1="1176" y1="266" x2="1224" y2="314" stroke="#d63b3b" stroke-width="7"/>'
        )
    caption = {
        EvidenceType.IMAGE_BEFORE: "Hodisadan oldingi kadr",
        EvidenceType.IMAGE_AFTER: "Hodisadan keyingi kadr",
    }.get(evidence_type, scene.type_name)
    return (
        _street(rng, scene.type_code in STOP_LINE_TYPES, stop_line)
        + extra
        + vehicle
        + box
        + _hud(scene, local, caption)
    )


def _vehicle_crop(scene: DemoScene, width: int, height: int) -> str:
    label = escape(" • ".join(p for p in (scene.vehicle_label, scene.vehicle_color) if p) or "—")
    return (
        '<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">'
        '<stop offset="0" stop-color="#4a4e55"/><stop offset="1" stop-color="#2a2c30"/>'
        "</linearGradient></defs>"
        f'<rect width="{width}" height="{height}" fill="url(#bg)"/>'
        f'<line x1="0" y1="330" x2="{width}" y2="330" stroke="#d9d9d4" stroke-width="4" '
        'stroke-dasharray="30 24" opacity="0.4"/>'
        + _vehicle(scene, width / 2, 360, 1.55, plate_text=True)
        + f'<rect x="16" y="16" width="{width - 32}" height="{height - 32}" fill="none" '
        f'stroke="{ACCENT}" stroke-width="3" rx="10"/>'
        f'<rect x="16" y="{height - 58}" width="{width - 32}" height="42" fill="#000" '
        'opacity="0.55"/>'
        f'<text x="34" y="{height - 30}" font-size="17" font-weight="600" '
        f'fill="#fff">{label}</text>'
    )


def _plate_crop(scene: DemoScene, width: int, height: int) -> str:
    plate = scene.plate_display or "—"
    parts = plate.split(" ", 1)
    region, rest = (parts[0], parts[1]) if len(parts) == 2 else ("", plate)
    return (
        f'<rect width="{width}" height="{height}" fill="#3a3d42"/>'
        f'<rect x="14" y="14" width="{width - 28}" height="{height - 28}" rx="12" fill="#f6f6f2" '
        'stroke="#111" stroke-width="4"/>'
        f'<line x1="104" y1="18" x2="104" y2="{height - 18}" stroke="#111" stroke-width="3"/>'
        f'<text x="59" y="{height / 2 + 20:.0f}" font-family="{MONO}" font-size="54" '
        f'font-weight="700" text-anchor="middle" fill="#111">{escape(region)}</text>'
        f'<text x="{(104 + width - 78) / 2:.0f}" y="{height / 2 + 20:.0f}" font-family="{MONO}" '
        f'font-size="56" font-weight="700" text-anchor="middle" fill="#111">{escape(rest)}</text>'
        f'<rect x="{width - 74}" y="30" width="46" height="10" fill="#1eb5e8"/>'
        f'<rect x="{width - 74}" y="40" width="46" height="10" fill="#fff" stroke="#d33" '
        'stroke-width="1"/>'
        f'<rect x="{width - 74}" y="50" width="46" height="10" fill="#2fae4f"/>'
        f'<text x="{width - 51}" y="{height - 34}" font-size="22" font-weight="700" '
        'text-anchor="middle" fill="#1e5fbf">UZ</text>'
    )
