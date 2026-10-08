import pytest
from pydantic import ValidationError

from app.core.config import Environment, Settings, normalize_database_url

STRONG = "x" * 48


def _production(**overrides: object) -> Settings:
    values: dict[str, object] = {
        "app_env": Environment.PRODUCTION,
        "jwt_secret": STRONG,
        "ai_service_token": STRONG,
        "stream_token_secret": STRONG,
        "camera_secret_key": STRONG,
        "cors_origins": "https://traffic.example.uz",
        "_env_file": None,
    }
    values.update(overrides)
    return Settings(**values)  # type: ignore[arg-type]


def test_production_accepts_strong_configuration() -> None:
    settings = _production()

    assert settings.is_production
    assert settings.cors_origin_list == ["https://traffic.example.uz"]


@pytest.mark.parametrize(
    "overrides",
    [
        {"jwt_secret": "change-me-generate-a-long-random-secret-at-least-32-chars"},
        {"ai_service_token": "short"},
        {"stream_token_secret": None},
        {"app_debug": True},
        {"cors_origins": "*"},
        {"storage_backend": "s3", "s3_endpoint": None},
    ],
)
def test_production_rejects_insecure_configuration(overrides: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        _production(**overrides)


def test_development_allows_placeholder_secrets() -> None:
    settings = Settings(
        jwt_secret="change-me",  # type: ignore[arg-type]
        ai_service_token="change-me",  # type: ignore[arg-type]
        _env_file=None,
    )

    assert not settings.is_production
    assert settings.jwt_secret.get_secret_value() == "change-me"


def test_cors_origins_are_split_and_trimmed() -> None:
    settings = Settings(
        jwt_secret=STRONG,  # type: ignore[arg-type]
        ai_service_token=STRONG,  # type: ignore[arg-type]
        cors_origins=" http://a.uz , ,http://b.uz ",
        _env_file=None,
    )

    assert settings.cors_origin_list == ["http://a.uz", "http://b.uz"]


@pytest.mark.parametrize(
    ("url", "expected"),
    [
        (
            "postgres://u:p@ep-x.eu-central-1.aws.neon.tech/db?sslmode=require&channel_binding=require",
            "postgresql+asyncpg://u:p@ep-x.eu-central-1.aws.neon.tech/db?ssl=require",
        ),
        ("postgresql://u:p@h:5432/db", "postgresql+asyncpg://u:p@h:5432/db"),
        ("postgresql+asyncpg://u@h/db?ssl=require", "postgresql+asyncpg://u@h/db?ssl=require"),
        ("sqlite+aiosqlite:///x.db", "sqlite+aiosqlite:///x.db"),
    ],
)
def test_database_url_is_normalized_for_asyncpg(url: str, expected: str) -> None:
    assert normalize_database_url(url) == expected


def test_vercel_environment_enables_serverless_mode(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("VERCEL", "1")
    settings = Settings(jwt_secret=STRONG, ai_service_token=STRONG, _env_file=None)  # type: ignore[arg-type]

    assert settings.serverless
