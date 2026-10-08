from fastapi import APIRouter

from app.api.routes import (
    auth,
    cameras,
    insights,
    internal,
    media,
    notifications,
    reference,
    system,
    vehicles,
    violations,
)

api_router = APIRouter()
api_router.include_router(system.router)
api_router.include_router(auth.router)
api_router.include_router(insights.dashboard)
api_router.include_router(cameras.router)
api_router.include_router(violations.router)
api_router.include_router(vehicles.router)
api_router.include_router(insights.analytics)
api_router.include_router(insights.map_router)
api_router.include_router(notifications.router)
api_router.include_router(reference.router)
api_router.include_router(media.router)
api_router.include_router(internal.router)
