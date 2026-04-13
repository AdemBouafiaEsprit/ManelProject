import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.routers import auth, containers, sensors, alerts, predictions, analytics, map as map_router
from app.services.websocket_manager import ws_manager
from app.services.mqtt_consumer import start_mqtt_consumer
from app.services.ml_service import score_all_containers

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("🚀 Starting STAM Reefer Platform API...")

    # Start Redis WebSocket listener
    asyncio.create_task(ws_manager.start_redis_listener())

    # Start MQTT consumer (in thread)
    loop = asyncio.get_event_loop()
    start_mqtt_consumer(loop)

    # Schedule ML scoring every 5 minutes
    async def run_scoring():
        async with AsyncSessionLocal() as db:
            await score_all_containers(db)

    scheduler.add_job(run_scoring, "interval", minutes=5, id="ml_scoring")
    scheduler.start()

    logger.info("✅ All services started")
    yield

    # Shutdown
    scheduler.shutdown()
    await ws_manager.close()
    logger.info("🛑 Shutdown complete")


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Intelligent Predictive Monitoring Platform for Reefer Containers — Port de Radès STAM",
    lifespan=lifespan,
)

# CORS — allow Angular dev server + VS Code Dev Tunnels
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:4200",
        "http://localhost:3000",
        # "https://jcjrd6v2-4200.euw.devtunnels.ms",
        # "https://jcjrd6v2-8000.euw.devtunnels.ms",
        "http://localhost:8000"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(auth.router, prefix="/api")
app.include_router(containers.router, prefix="/api")
app.include_router(sensors.router, prefix="/api")
app.include_router(alerts.router, prefix="/api")
app.include_router(predictions.router, prefix="/api")
app.include_router(analytics.router, prefix="/api")
app.include_router(map_router.router, prefix="/api")


@app.get("/")
async def root():
    return {
        "platform": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "status": "operational",
        "docs": "/docs",
    }


@app.get("/health")
async def health():
    return {"status": "ok", "service": "reefer-api"}


@app.websocket("/ws/live")
async def websocket_live(websocket: WebSocket):
    await ws_manager.connect(websocket)
    try:
        while True:
            # Keep connection alive — client can send pings
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        ws_manager.disconnect(websocket)
