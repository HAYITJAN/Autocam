from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import parse_qs, urlsplit
from zoneinfo import ZoneInfo

import pytest

from app.models.enums import EvidenceType
from app.services import demo_media
from app.services.media import EVIDENCE_KIND, MediaSigner, MediaVariant, local_file

NOW = 1_800_000_000.0


def _signer() -> MediaSigner:
    return MediaSigner(secret=b"k" * 32, ttl_seconds=900, base_path="/api/v1/media/evidence")


def _params(url: str) -> dict[str, str]:
    return {k: v[0] for k, v in parse_qs(urlsplit(url).query).items()}


def test_signed_url_roundtrip() -> None:
    signer = _signer()
    params = _params(signer.url(42, MediaVariant.ORIGINAL, now=NOW))
    assert signer.verify(
        42, MediaVariant.ORIGINAL, int(params["expires"]), params["signature"], NOW
    )


@pytest.mark.parametrize(
    ("evidence_id", "variant", "now"),
    [
        (43, MediaVariant.ORIGINAL, NOW),
        (42, MediaVariant.THUMBNAIL, NOW),
        (42, MediaVariant.ORIGINAL, NOW + 3600),
    ],
)
def test_signature_is_bound_to_id_variant_and_expiry(
    evidence_id: int, variant: MediaVariant, now: float
) -> None:
    signer = _signer()
    params = _params(signer.url(42, MediaVariant.ORIGINAL, now=NOW))
    assert not signer.verify(evidence_id, variant, int(params["expires"]), params["signature"], now)


def test_far_future_expiry_is_rejected() -> None:
    signer = _signer()
    expires = int(NOW) + 10 * 900
    signature = signer._signature(42, MediaVariant.ORIGINAL, expires)
    assert not signer.verify(42, MediaVariant.ORIGINAL, expires, signature, NOW)


def test_every_evidence_type_has_a_kind() -> None:
    assert set(EVIDENCE_KIND) == set(EvidenceType)


def test_local_file_rejects_path_traversal(tmp_path: Path) -> None:
    root = tmp_path / "storage"
    root.mkdir()
    (tmp_path / "outside.jpg").write_bytes(b"x")
    (root / "inside.jpg").write_bytes(b"x")
    assert local_file(str(root), "../outside.jpg") is None
    assert local_file(str(root), "missing.jpg") is None
    assert local_file(str(root), "inside.jpg") == (root / "inside.jpg").resolve()


def test_demo_render_is_deterministic_and_escaped() -> None:
    scene = demo_media.DemoScene(
        violation_id=7,
        violation_code="VL-000007",
        type_code="SPEEDING",
        type_name="Tezlik <oshirish>",
        camera_code="CAM-001",
        camera_name="Amir Temur & Navoiy",
        plate_display="01 A 123 BC",
        vehicle_label="Chevrolet Cobalt",
        vehicle_color="Oq",
        vehicle_type="CAR",
        detected_speed=92.0,
        speed_limit=60.0,
    )
    at = datetime(2026, 1, 15, 4, 0, tzinfo=UTC)
    tz = ZoneInfo("Asia/Tashkent")
    for evidence_type in demo_media.SIZES:
        first = demo_media.render(evidence_type, scene, at, tz)
        assert first == demo_media.render(evidence_type, scene, at, tz)
        assert b"<oshirish>" not in first
        assert b"Amir Temur & Navoiy" not in first
    frame = demo_media.render(EvidenceType.IMAGE_MAIN, scene, at, tz).decode()
    assert "2026-01-15 09:00:00.000" in frame
    assert "92 km/soat" in frame
