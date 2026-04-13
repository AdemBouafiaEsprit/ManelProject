import json
import asyncio
import logging
from typing import Dict, Set
from fastapi import WebSocket
import redis.asyncio as aioredis
from app.core.config import settings

logger = logging.getLogger(__name__)

REDIS_CHANNEL = "reefer:live"


class WebSocketManager:
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()
        self._redis: aioredis.Redis | None = None
        self._pubsub = None

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.add(websocket)
        logger.info(f"WebSocket connected. Total: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        self.active_connections.discard(websocket)
        logger.info(f"WebSocket disconnected. Total: {len(self.active_connections)}")

    async def broadcast(self, message: dict):
        """Broadcast a message to all connected WebSocket clients."""
        data = json.dumps(message, default=str)
        dead = set()
        for ws in list(self.active_connections):
            try:
                await ws.send_text(data)
            except Exception:
                dead.add(ws)
        for ws in dead:
            self.active_connections.discard(ws)

    async def publish_to_redis(self, message: dict):
        """Publish a message to Redis pub/sub channel."""
        if self._redis:
            await self._redis.publish(REDIS_CHANNEL, json.dumps(message, default=str))

    async def start_redis_listener(self):
        """Start listening to Redis pub/sub and forward to WebSocket clients."""
        try:
            self._redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
            self._pubsub = self._redis.pubsub()
            await self._pubsub.subscribe(REDIS_CHANNEL)
            logger.info("Redis WebSocket listener started")

            async for message in self._pubsub.listen():
                if message["type"] == "message":
                    try:
                        data = json.loads(message["data"])
                        await self.broadcast(data)
                    except Exception as e:
                        logger.error(f"Redis message processing error: {e}")
        except Exception as e:
            logger.error(f"Redis listener error: {e}")

    async def close(self):
        if self._pubsub:
            await self._pubsub.unsubscribe(REDIS_CHANNEL)
        if self._redis:
            await self._redis.aclose()


ws_manager = WebSocketManager()
