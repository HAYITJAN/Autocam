import time
from datetime import UTC, datetime
from typing import Annotated

from fastapi import Depends, FastAPI
from pydantic import BaseModel

from app.config import Settings, get_settings

started_monotonic = time.monotonic()

app = FastAPI(
    title="SMART TRAFFIC AI Service",
    version=get_settings().service_version,
    description="Video ingestion, detection, tracking, plate recognition and rule evaluation.",
    docs_url="/docs",
    redoc_url=None,
)


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str
    mode: str
    detector: str
    server_time: datetime
    uptime_seconds: float
    workers: int


@app.get("/health", summary="AI service liveness and mode", response_model=HealthResponse)
async def health(settings: Annotated[Settings, Depends(get_settings)]) -> HealthResponse:
    return HealthResponse(
        status="ok",
        service=settings.service_name,
        version=settings.service_version,
        mode=settings.ai_mode.value,
        detector=settings.effective_detector.value,
        server_time=datetime.now(UTC),
        uptime_seconds=round(time.monotonic() - started_monotonic, 1),
        workers=0,
    )
