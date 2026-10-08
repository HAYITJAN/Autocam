from enum import StrEnum
from functools import lru_cache

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class AIMode(StrEnum):
    MOCK = "mock"
    VIDEO = "video"
    RTSP = "rtsp"


class DetectorBackend(StrEnum):
    MOCK = "mock"
    ONNX = "onnx"
    ULTRALYTICS = "ultralytics"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", case_sensitive=False)

    service_name: str = "smart-traffic-ai"
    service_version: str = "0.1.0"
    log_level: str = "INFO"

    ai_mode: AIMode = AIMode.MOCK
    ai_detector: DetectorBackend = DetectorBackend.ONNX
    backend_url: str = "http://localhost:8000"
    ai_service_token: SecretStr
    stream_token_secret: SecretStr | None = None
    heartbeat_interval_seconds: int = Field(default=5, ge=1)

    @property
    def effective_detector(self) -> DetectorBackend:
        """Mock mode always uses simulator ground truth regardless of the configured detector."""
        return DetectorBackend.MOCK if self.ai_mode is AIMode.MOCK else self.ai_detector


@lru_cache
def get_settings() -> Settings:
    return Settings()
