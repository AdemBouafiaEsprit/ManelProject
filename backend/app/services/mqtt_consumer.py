"""
MQTT Consumer — subscribes to reefer sensor topics and persists readings.
"""
import json
import logging
import asyncio
from datetime import datetime, timezone
from uuid import UUID
import paho.mqtt.client as mqtt
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models.container import Container
from app.models.sensor import SensorReading
from app.services.alert_engine import evaluate_reading
from app.services.websocket_manager import ws_manager

logger = logging.getLogger(__name__)

_container_cache: dict[str, UUID] = {}  # container_number → id


async def _get_container_id(container_number: str, db: AsyncSession) -> UUID | None:
    if container_number in _container_cache:
        return _container_cache[container_number]
    result = await db.execute(
        select(Container.id).where(Container.container_number == container_number)
    )
    row = result.scalar_one_or_none()
    if row:
        _container_cache[container_number] = row
    return row


def _parse_container_from_topic(topic: str) -> str | None:
    parts = topic.split("/")
    if len(parts) >= 3 and parts[0] == "reefer":
        return parts[2]
    return None


async def _process_message(topic: str, payload: str):
    """Process an incoming MQTT message asynchronously."""
    try:
        container_number = _parse_container_from_topic(topic)
        if not container_number:
            return

        data = json.loads(payload)

        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(Container).where(Container.container_number == container_number)
            )
            container = result.scalar_one_or_none()
            if not container:
                return

            reading = SensorReading(
                container_id=container.id,
                time=datetime.now(timezone.utc),
                temperature=data.get("temperature"),
                power_consumption=data.get("power_consumption"),
                door_status=data.get("door_status", False),
                compressor_status=data.get("compressor_status", True),
                vibration_level=data.get("vibration_level"),
                supply_voltage=data.get("supply_voltage"),
            )
            db.add(reading)

            # Run alert engine
            alerts = await evaluate_reading(container, reading, db)
            await db.commit()

            # Broadcast sensor update
            await ws_manager.publish_to_redis({
                "type": "sensor_update",
                "container_id": str(container.id),
                "container_number": container_number,
                "data": {
                    "temperature": reading.temperature,
                    "power_consumption": reading.power_consumption,
                    "door_status": reading.door_status,
                    "compressor_status": reading.compressor_status,
                    "vibration_level": reading.vibration_level,
                    "supply_voltage": reading.supply_voltage,
                    "time": reading.time.isoformat(),
                }
            })

    except Exception as e:
        logger.error(f"MQTT message processing error: {e}")


_loop: asyncio.AbstractEventLoop | None = None


def _on_connect(client, userdata, flags, rc):
    logger.info(f"MQTT connected (rc={rc})")
    client.subscribe("reefer/sensor/#")
    client.subscribe("reefer/alerts/#")


def _on_message(client, userdata, msg):
    topic = msg.topic
    payload = msg.payload.decode("utf-8")
    if _loop:
        asyncio.run_coroutine_threadsafe(_process_message(topic, payload), _loop)


def start_mqtt_consumer(loop: asyncio.AbstractEventLoop):
    global _loop
    _loop = loop

    client = mqtt.Client(client_id="reefer-api-consumer")
    client.on_connect = _on_connect
    client.on_message = _on_message

    try:
        client.connect(settings.MQTT_BROKER_HOST, settings.MQTT_BROKER_PORT, keepalive=60)
        client.loop_start()
        logger.info(f"MQTT consumer started → {settings.MQTT_BROKER_HOST}:{settings.MQTT_BROKER_PORT}")
    except Exception as e:
        logger.error(f"MQTT connection failed: {e}")
