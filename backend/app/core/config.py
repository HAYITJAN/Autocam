import os
from enum import StrEnum
from functools import lru_cache
from typing import Self
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

INSECURE_SECRET_MARKER = "change-me"  # noqa: S105
MIN_SECRET_LENGTH = 32
ASYNCPG_SCHEME = "postgresql+asyncpg"


def normalize_database_url(url: str) -> str:
    """Turn provider URLs (`postgres://…?sslmode=require`) into asyncpg URLs.

    Hosted Postgres (Neon, Supabase, Vercel) hands out libpq-style URLs; asyncpg
    takes `ssl` instead of `sslmode` and rejects libpq-only `channel_binding`.
    """
    parts = urlsplit(url)
    if parts.scheme not in ("postgres", "postgresql", ASYNCPG_SCHEME):
        return url
    query = [
        ("ssl" if key == "sslmode" else key, value)
        for key, value in parse_qsl(parts.query, keep_blank_values=True)
        if key != "channel_binding"
    ]
    return urlunsplit((ASYNCPG_SCHEME, parts.netloc, parts.path, urlencode(query), parts.fragment))


class Environment(StrEnum):
    DEVELOPMENT = "development"
    TEST = "test"
    PRODUCTION = "production"


class StorageBackend(StrEnum):
    LOCAL = "local"
    S3 = "s3"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=("../.env", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    app_name: str = "SMART TRAFFIC"
    app_version: str = "0.1.0"
    app_env: Environment = Environment.DEVELOPMENT
    app_debug: bool = False
    log_level: str = "INFO"
    demo_mode: bool = True
    enable_docs: bool = True
    display_timezone: str = "Asia/Tashkent"
    api_v1_prefix: str = "/api/v1"

    database_url: str = "postgresql+asyncpg://smart:smart@localhost:5432/smart_traffic"
    database_pool_size: int = Field(default=10, ge=1, le=100)
    database_max_overflow: int = Field(default=20, ge=0, le=200)
    database_echo: bool = False
    # Short-lived serverless instances must not keep a connection pool; on by itself on Vercel.
    serverless: bool = False

    redis_url: str = "redis://localhost:6379/0"
    celery_broker_url: str = "redis://localhost:6379/1"

    jwt_secret: SecretStr
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = Field(default=15, ge=1, le=1440)
    jwt_refresh_expire_days: int = Field(default=7, ge=1, le=90)
    password_reset_expire_minutes: int = Field(default=30, ge=5, le=1440)
    login_max_attempts: int = Field(default=5, ge=1, le=50)
    login_lockout_minutes: int = Field(default=15, ge=1, le=1440)
    camera_secret_key: SecretStr | None = None
    stream_token_secret: SecretStr | None = None

    ai_service_url: str = "http://localhost:8001"
    ai_service_token: SecretStr
    heartbeat_interval_seconds: int = Field(default=5, ge=1)
    heartbeat_timeout_seconds: int = Field(default=30, ge=5)

    storage_backend: StorageBackend = StorageBackend.LOCAL
    storage_path: str = "./storage_data"
    media_url_ttl_seconds: int = Field(default=900, ge=60, le=86400)
    violation_dedup_window_seconds: int = Field(
        default=60,
        ge=0,
        le=3600,
        description="Reports of the same vehicle/camera/type closer than this are one event",
    )
    s3_endpoint: str | None = None
    s3_region: str = "us-east-1"
    s3_bucket: str = "smart-traffic-evidence"
    s3_access_key: SecretStr | None = None
    s3_secret_key: SecretStr | None = None

    cors_origins: str = "http://localhost:5173"
    websocket_url: str = "ws://localhost/api/v1/ws"

    health_check_timeout_seconds: float = Field(default=2.0, gt=0, le=30)

    @field_validator("database_url")
    @classmethod
    def _asyncpg_database_url(cls, value: str) -> str:
        return normalize_database_url(value)

    @model_validator(mode="after")
    def _detect_serverless(self) -> Self:
        if os.environ.get("VERCEL"):
            self.serverless = True
        return self

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def is_production(self) -> bool:
        return self.app_env is Environment.PRODUCTION

    @property
    def cookie_secure(self) -> bool:
        return self.is_production

    @property
    def docs_enabled(self) -> bool:
        return self.enable_docs or not self.is_production

    @model_validator(mode="after")
    def _validate_production_secrets(self) -> Self:
        if not self.is_production:
            return self
        required: dict[str, SecretStr | None] = {
            "JWT_SECRET": self.jwt_secret,
            "AI_SERVICE_TOKEN": self.ai_service_token,
            "STREAM_TOKEN_SECRET": self.stream_token_secret,
            "CAMERA_SECRET_KEY": self.camera_secret_key,
        }
        for name, secret in required.items():
            value = secret.get_secret_value() if secret else ""
            if INSECURE_SECRET_MARKER in value or len(value) < MIN_SECRET_LENGTH:
                raise ValueError(
                    f"{name} must be set to a random value of at least "
                    f"{MIN_SECRET_LENGTH} characters in production"
                )
        if self.app_debug:
            raise ValueError("APP_DEBUG must be false in production")
        if "*" in self.cors_origin_list:
            raise ValueError("CORS_ORIGINS must not contain '*' in production")
        if self.storage_backend is StorageBackend.S3 and not self.s3_endpoint:
            raise ValueError("S3_ENDPOINT is required when STORAGE_BACKEND=s3")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
