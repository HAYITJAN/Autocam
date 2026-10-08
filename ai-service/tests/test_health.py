import os

os.environ.setdefault("AI_SERVICE_TOKEN", "test-ai-service-token-value-long-enough-for-tests")

from fastapi.testclient import TestClient

from app.config import AIMode, DetectorBackend, Settings
from app.main import app


def test_health_reports_mode_and_detector() -> None:
    response = TestClient(app).get("/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["mode"] in {mode.value for mode in AIMode}


def test_mock_mode_forces_mock_detector() -> None:
    settings = Settings(ai_mode=AIMode.MOCK, ai_detector=DetectorBackend.ONNX, _env_file=None)

    assert settings.effective_detector is DetectorBackend.MOCK


def test_real_modes_use_configured_detector() -> None:
    settings = Settings(
        ai_mode=AIMode.RTSP, ai_detector=DetectorBackend.ULTRALYTICS, _env_file=None
    )

    assert settings.effective_detector is DetectorBackend.ULTRALYTICS
