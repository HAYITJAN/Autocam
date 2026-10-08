import pytest
from fastapi import APIRouter, FastAPI
from httpx import AsyncClient
from pydantic import BaseModel, Field

from app.core.errors import ConflictError, NotFoundError


class CameraPayload(BaseModel):
    code: str = Field(min_length=3)
    fps: int = Field(ge=1, le=60)


@pytest.fixture(autouse=True)
def _error_routes(app: FastAPI) -> None:
    router = APIRouter(prefix="/_test")

    @router.get("/cameras/{camera_id}")
    async def missing_camera(camera_id: int) -> None:
        raise NotFoundError("Camera")

    @router.post("/cameras")
    async def create_camera(payload: CameraPayload) -> CameraPayload:
        return payload

    @router.get("/conflict")
    async def conflict() -> None:
        raise ConflictError("Camera code already exists", code="CAMERA_CODE_TAKEN")

    @router.get("/boom")
    async def boom() -> None:
        raise RuntimeError("database password is hunter2")

    app.include_router(router)


async def test_domain_not_found_matches_spec_error_format(client: AsyncClient) -> None:
    response = await client.get("/_test/cameras/7")

    assert response.status_code == 404
    body = response.json()
    assert body["success"] is False
    assert body["error"]["code"] == "CAMERA_NOT_FOUND"
    assert body["error"]["message"] == "Camera was not found"


async def test_custom_code_on_app_error(client: AsyncClient) -> None:
    response = await client.get("/_test/conflict")

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "CAMERA_CODE_TAKEN"


async def test_validation_errors_list_fields(client: AsyncClient) -> None:
    response = await client.post("/_test/cameras", json={"code": "C", "fps": 500})

    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "VALIDATION_ERROR"
    assert {item["field"] for item in error["details"]} == {"code", "fps"}


async def test_path_parameter_validation_uses_envelope(client: AsyncClient) -> None:
    response = await client.get("/_test/cameras/not-a-number")

    assert response.status_code == 422
    assert response.json()["error"]["details"][0]["field"] == "camera_id"


async def test_unknown_route_returns_not_found_envelope(client: AsyncClient) -> None:
    response = await client.get("/api/v1/does-not-exist")

    assert response.status_code == 404
    assert response.json() == {
        "success": False,
        "error": {
            "code": "NOT_FOUND",
            "message": "Not Found",
            "details": None,
            "request_id": response.headers["X-Request-ID"],
        },
    }


async def test_method_not_allowed_uses_envelope(client: AsyncClient) -> None:
    response = await client.delete("/api/v1/system/health")

    assert response.status_code == 405
    assert response.json()["error"]["code"] == "METHOD_NOT_ALLOWED"


def test_app_error_status_is_plain_int() -> None:
    assert type(NotFoundError("Camera").status_code) is int
    assert type(ConflictError().status_code) is int


async def test_unhandled_exception_does_not_leak_internals(client: AsyncClient) -> None:
    response = await client.get("/_test/boom")

    assert response.status_code == 500
    error = response.json()["error"]
    assert error["code"] == "INTERNAL_ERROR"
    assert "hunter2" not in response.text
    assert error["request_id"] == response.headers["X-Request-ID"]
