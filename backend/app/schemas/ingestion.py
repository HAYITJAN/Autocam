"""Internal contract between the AI service and the backend."""

from datetime import datetime
from typing import Any, Self

from pydantic import Field, model_validator

from app.models.enums import TrafficLightState
from app.schemas.common import ApiModel


class ViolationIngest(ApiModel):
    camera_code: str = Field(max_length=20, examples=["CAM-001"])
    violation_type: str = Field(max_length=40, examples=["RED_LIGHT"])
    occurred_at: datetime
    ai_confidence: float = Field(ge=0, le=1)
    plate_number: str | None = Field(default=None, max_length=20, examples=["01A123BC"])
    plate_display: str | None = Field(default=None, max_length=20, examples=["01 A 123 BC"])
    track_id: str | None = Field(default=None, max_length=64)
    vehicle_type: str | None = Field(default=None, max_length=20, examples=["CAR"])
    brand: str | None = Field(default=None, max_length=60)
    model: str | None = Field(default=None, max_length=60)
    color: str | None = Field(default=None, max_length=30)
    direction: str | None = Field(default=None, max_length=20, examples=["NORTH"])
    detected_speed: float | None = Field(default=None, ge=0, le=400)
    speed_limit: float | None = Field(default=None, ge=0, le=400)
    traffic_light_state: TrafficLightState | None = None
    idempotency_key: str | None = Field(default=None, max_length=200)
    metadata: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def _identifiable(self) -> Self:
        if not (self.plate_number and self.plate_number.strip()) and not self.track_id:
            raise ValueError("plate_number or track_id is required to identify the vehicle")
        return self


class ViolationIngestResult(ApiModel):
    id: int
    code: str
    duplicate: bool = Field(description="True when folded into an existing event")
    duplicate_count: int
