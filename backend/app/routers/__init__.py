from app.routers.auth import router as auth_router
from app.routers.containers import router as containers_router
from app.routers.sensors import router as sensors_router
from app.routers.alerts import router as alerts_router
from app.routers.predictions import router as predictions_router
from app.routers.analytics import router as analytics_router
from app.routers.map import router as map_router

__all__ = [
    "auth_router",
    "containers_router",
    "sensors_router",
    "alerts_router",
    "predictions_router",
    "analytics_router",
    "map_router",
]
