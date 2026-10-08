from httpx import AsyncClient

from tests.conftest import FakeHealthService

API = "/api/v1"


async def test_health_returns_liveness_envelope(client: AsyncClient) -> None:
    response = await client.get(f"{API}/system/health")

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["data"]["status"] == "alive"
    assert body["data"]["environment"] == "test"
    assert body["data"]["uptime_seconds"] >= 0


async def test_responses_carry_request_id_and_security_headers(client: AsyncClient) -> None:
    response = await client.get(f"{API}/system/health")

    assert len(response.headers["X-Request-ID"]) == 32
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["X-Frame-Options"] == "DENY"
    assert "default-src 'none'" in response.headers["Content-Security-Policy"]
    assert "Strict-Transport-Security" not in response.headers


async def test_valid_incoming_request_id_is_propagated(client: AsyncClient) -> None:
    response = await client.get(f"{API}/system/health", headers={"X-Request-ID": "trace-1234abcd"})

    assert response.headers["X-Request-ID"] == "trace-1234abcd"


async def test_malformed_incoming_request_id_is_replaced(client: AsyncClient) -> None:
    response = await client.get(
        f"{API}/system/health", headers={"X-Request-ID": "<script>alert(1)</script>"}
    )

    assert response.headers["X-Request-ID"] != "<script>alert(1)</script>"
    assert len(response.headers["X-Request-ID"]) == 32


async def test_ready_when_all_components_up(client: AsyncClient) -> None:
    response = await client.get(f"{API}/system/ready")

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["status"] == "ready"
    assert {c["name"] for c in data["components"]} == {"database", "redis", "ai_service"}


async def test_ready_is_degraded_when_only_ai_service_is_down(
    client: AsyncClient, health_service: FakeHealthService
) -> None:
    health_service.down = {"ai_service"}

    response = await client.get(f"{API}/system/ready")

    assert response.status_code == 200
    assert response.json()["data"]["status"] == "degraded"


async def test_ready_returns_503_error_envelope_when_database_is_down(
    client: AsyncClient, health_service: FakeHealthService
) -> None:
    health_service.down = {"database"}

    response = await client.get(f"{API}/system/ready")

    assert response.status_code == 503
    body = response.json()
    assert body["success"] is False
    assert body["error"]["code"] == "SERVICE_UNAVAILABLE"
    assert body["error"]["request_id"] == response.headers["X-Request-ID"]
    states = {c["name"]: c["state"] for c in body["error"]["details"]}
    assert states == {"database": "down", "redis": "up", "ai_service": "up"}


async def test_docs_are_served_with_relaxed_csp(client: AsyncClient) -> None:
    schema = await client.get("/api/openapi.json")
    docs = await client.get("/api/docs")

    assert schema.status_code == 200
    assert "/api/v1/system/ready" in schema.json()["paths"]
    assert docs.status_code == 200
    assert "Content-Security-Policy" not in docs.headers


async def test_cors_preflight_allows_configured_origin(client: AsyncClient) -> None:
    response = await client.options(
        f"{API}/system/health",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert response.headers["access-control-allow-credentials"] == "true"


async def test_cors_preflight_rejects_unknown_origin(client: AsyncClient) -> None:
    response = await client.options(
        f"{API}/system/health",
        headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "GET"},
    )

    assert "access-control-allow-origin" not in response.headers
