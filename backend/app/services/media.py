"""Evidence media: signed short-lived URLs and file resolution.

Browsers load evidence through `<img>`/`<video>` tags, which cannot send the bearer
token, so every evidence URL carries an HMAC signature bound to the evidence id,
the variant and an expiry instead.
"""

import hashlib
import hmac
import time
from dataclasses import dataclass
from enum import StrEnum
from pathlib import Path
from urllib.parse import urlencode

from app.core.config import Settings
from app.models import ViolationEvidence
from app.models.enums import EvidenceType
from app.schemas.domain import EvidenceKind, EvidenceOut

DEMO_STORAGE = "demo"

EVIDENCE_KIND: dict[EvidenceType, EvidenceKind] = {
    EvidenceType.IMAGE_MAIN: EvidenceKind.FULL_FRAME,
    EvidenceType.DETECTION_FRAME: EvidenceKind.FULL_FRAME,
    EvidenceType.VEHICLE_CROP: EvidenceKind.VEHICLE,
    EvidenceType.PLATE_CROP: EvidenceKind.PLATE,
    EvidenceType.IMAGE_BEFORE: EvidenceKind.CONTEXT,
    EvidenceType.IMAGE_AFTER: EvidenceKind.CONTEXT,
    EvidenceType.VIDEO_CLIP: EvidenceKind.VIDEO,
}

KIND_ORDER = (
    EvidenceKind.FULL_FRAME,
    EvidenceKind.VEHICLE,
    EvidenceKind.PLATE,
    EvidenceKind.CONTEXT,
    EvidenceKind.VIDEO,
)


class MediaVariant(StrEnum):
    ORIGINAL = "original"
    THUMBNAIL = "thumbnail"


@dataclass(frozen=True, slots=True)
class MediaSigner:
    secret: bytes
    ttl_seconds: int
    base_path: str

    @classmethod
    def from_settings(cls, settings: Settings) -> "MediaSigner":
        secret = settings.stream_token_secret or settings.jwt_secret
        # Domain-separate from JWT signing even when the JWT secret is reused.
        key = hmac.new(secret.get_secret_value().encode(), b"evidence-media", hashlib.sha256)
        return cls(
            secret=key.digest(),
            ttl_seconds=settings.media_url_ttl_seconds,
            base_path=f"{settings.api_v1_prefix}/media/evidence",
        )

    def _signature(self, evidence_id: int, variant: MediaVariant, expires: int) -> str:
        message = f"{evidence_id}:{variant.value}:{expires}".encode()
        return hmac.new(self.secret, message, hashlib.sha256).hexdigest()

    def url(self, evidence_id: int, variant: MediaVariant, now: float | None = None) -> str:
        # Round the expiry up to the TTL so repeated renders yield cacheable, stable URLs.
        current = int(now if now is not None else time.time())
        expires = (current // self.ttl_seconds + 2) * self.ttl_seconds
        query = urlencode(
            {
                "variant": variant.value,
                "expires": expires,
                "signature": self._signature(evidence_id, variant, expires),
            }
        )
        return f"{self.base_path}/{evidence_id}?{query}"

    def verify(
        self,
        evidence_id: int,
        variant: MediaVariant,
        expires: int,
        signature: str,
        now: float | None = None,
    ) -> bool:
        current = now if now is not None else time.time()
        if expires < current or expires > current + 3 * self.ttl_seconds:
            return False
        expected = self._signature(evidence_id, variant, expires)
        return hmac.compare_digest(expected, signature)


def evidence_out(evidence: ViolationEvidence, signer: MediaSigner) -> EvidenceOut:
    return EvidenceOut(
        id=evidence.id,
        evidence_type=evidence.evidence_type,
        kind=EVIDENCE_KIND[evidence.evidence_type],
        mime_type=evidence.mime_type,
        width=evidence.width,
        height=evidence.height,
        duration_s=evidence.duration_s,
        captured_at=evidence.captured_at,
        file_url=signer.url(evidence.id, MediaVariant.ORIGINAL),
        thumbnail_url=signer.url(evidence.id, MediaVariant.THUMBNAIL),
    )


def sort_evidence(items: list[EvidenceOut]) -> list[EvidenceOut]:
    return sorted(items, key=lambda e: (KIND_ORDER.index(e.kind), e.captured_at, e.id))


def local_file(storage_root: str, storage_key: str) -> Path | None:
    """Resolve a stored key inside the storage root; None for missing or escaping paths."""
    root = Path(storage_root).resolve()
    candidate = (root / storage_key).resolve()
    if not candidate.is_relative_to(root) or not candidate.is_file():
        return None
    return candidate
