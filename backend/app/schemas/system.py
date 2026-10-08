from datetime import datetime
from enum import StrEnum

from pydantic import Field

from app.schemas.common import ApiModel


class ComponentState(StrEnum):
    UP = "up"
    DOWN = "down"


class ReadinessState(StrEnum):
    READY = "ready"
    DEGRADED = "degraded"
    NOT_READY = "not_ready"


class ComponentHealth(ApiModel):
    name: str = Field(examples=["database"])
    state: ComponentState
    critical: bool = Field(description="When a critical component is down the API is not ready")
    latency_ms: float | None = None
    detail: str | None = None


class LivenessStatus(ApiModel):
    status: str = Field(default="alive", examples=["alive"])
    app: str
    version: str
    environment: str
    demo_mode: bool
    server_time: datetime
    uptime_seconds: float


class ReadinessStatus(ApiModel):
    status: ReadinessState
    components: list[ComponentHealth]
