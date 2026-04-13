"""
Rule-based alert engine for Phase 1.
Evaluates sensor readings and creates alerts based on predefined thresholds.
"""
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from app.models.alert import Alert
from app.models.container import Container
from app.models.sensor import SensorReading
from app.services.websocket_manager import ws_manager

logger = logging.getLogger(__name__)

DEDUP_WINDOW_MINUTES = 15  # Don't re-create same alert type within this window


async def check_temp_excursion(
    container: Container, reading: SensorReading, db: AsyncSession
) -> Optional[Alert]:
    deviation = abs(reading.temperature - container.target_temp)
    tolerance = container.tolerance or 2.0

    if deviation > tolerance * 3.0:
        severity = "CRITICAL"
        action = (
            f"IMMEDIATE inspection required at slot {container.block}-{container.row_num:02d}-{container.bay:02d} "
            f"(ECP {container.ecp_id}). Temperature deviation: {deviation:.1f}°C from setpoint {container.target_temp}°C."
        )
    elif deviation > tolerance * 1.5:
        severity = "WARNING"
        action = (
            f"Check refrigeration unit for container at {container.block}-{container.row_num:02d}-{container.bay:02d}. "
            f"Temperature deviation: {deviation:.1f}°C."
        )
    else:
        return None

    return await _create_alert_if_new(
        container=container,
        alert_type="TEMP_EXCURSION",
        severity=severity,
        message=(
            f"{severity}: Temperature excursion on {container.container_number} ({container.commodity}). "
            f"Current: {reading.temperature:.1f}°C, Setpoint: {container.target_temp}°C "
            f"(deviation: {deviation:.1f}°C, tolerance: ±{tolerance}°C)"
        ),
        recommended_action=action,
        db=db,
    )


async def check_compressor_fault(
    container: Container, reading: SensorReading, db: AsyncSession
) -> Optional[Alert]:
    if not reading.compressor_status:
        return await _create_alert_if_new(
            container=container,
            alert_type="COMPRESSOR_FAULT",
            severity="CRITICAL",
            message=(
                f"CRITICAL: Compressor OFF on {container.container_number} ({container.commodity}). "
                f"Temperature may rise without cooling."
            ),
            recommended_action=(
                f"Dispatch technician to {container.block}-{container.row_num:02d}-{container.bay:02d} "
                f"(ECP {container.ecp_id}). Verify power supply and compressor unit."
            ),
            db=db,
        )
    return None


async def check_door_open(
    container: Container, reading: SensorReading, db: AsyncSession
) -> Optional[Alert]:
    if reading.door_status:
        return await _create_alert_if_new(
            container=container,
            alert_type="DOOR_OPEN",
            severity="WARNING",
            message=(
                f"WARNING: Door open on {container.container_number} ({container.commodity}). "
                f"Cold air loss detected."
            ),
            recommended_action=f"Verify door closure at slot {container.block}-{container.row_num:02d}-{container.bay:02d}.",
            db=db,
        )
    return None


async def check_humidity_deviation(
    container: Container, reading: SensorReading, db: AsyncSession
) -> Optional[Alert]:
    if container.target_humidity and reading.humidity:
        deviation = abs(reading.humidity - container.target_humidity)
        if deviation > 15:
            return await _create_alert_if_new(
                container=container,
                alert_type="HUMIDITY_DEVIATION",
                severity="WARNING",
                message=(
                    f"WARNING: Humidity deviation on {container.container_number}. "
                    f"Current: {reading.humidity:.1f}%RH, Target: {container.target_humidity}%RH."
                ),
                recommended_action="Check humidity control system.",
                db=db,
            )
    return None


async def check_voltage_drop(
    container: Container, reading: SensorReading, db: AsyncSession
) -> Optional[Alert]:
    if reading.supply_voltage and reading.supply_voltage < 200:
        return await _create_alert_if_new(
            container=container,
            alert_type="VOLTAGE_DROP",
            severity="CRITICAL",
            message=(
                f"CRITICAL: Low supply voltage on {container.container_number}. "
                f"Current: {reading.supply_voltage:.1f}V (normal: 220-240V)."
            ),
            recommended_action=f"Check ECP {container.ecp_id} power supply immediately.",
            db=db,
        )
    return None


async def evaluate_reading(
    container: Container, reading: SensorReading, db: AsyncSession
) -> list[Alert]:
    """Run all alert rules and return newly created alerts."""
    alerts = []
    checks = [
        check_temp_excursion,
        check_compressor_fault,
        check_door_open,
        check_humidity_deviation,
        check_voltage_drop,
    ]
    for check_fn in checks:
        try:
            alert = await check_fn(container, reading, db)
            if alert:
                alerts.append(alert)
                # Broadcast via WebSocket
                await ws_manager.publish_to_redis({
                    "type": "new_alert",
                    "container_id": str(container.id),
                    "container_number": container.container_number,
                    "data": {
                        "alert_id": str(alert.id),
                        "alert_type": alert.alert_type,
                        "severity": alert.severity,
                        "message": alert.message,
                        "triggered_at": alert.triggered_at.isoformat() if alert.triggered_at else None,
                    }
                })
        except Exception as e:
            logger.error(f"Alert check error for {container.container_number}: {e}")

    return alerts


async def _create_alert_if_new(
    container: Container,
    alert_type: str,
    severity: str,
    message: str,
    recommended_action: str,
    db: AsyncSession,
) -> Optional[Alert]:
    """Create an alert only if no similar active alert exists within the dedup window."""
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=DEDUP_WINDOW_MINUTES)
    existing = await db.execute(
        select(Alert).where(
            and_(
                Alert.container_id == container.id,
                Alert.alert_type == alert_type,
                Alert.is_active == True,
                Alert.triggered_at >= cutoff,
            )
        )
    )
    if existing.scalar_one_or_none():
        return None  # Already exists — skip

    alert = Alert(
        container_id=container.id,
        alert_type=alert_type,
        severity=severity,
        message=message,
        recommended_action=recommended_action,
    )
    db.add(alert)
    await db.flush()
    logger.info(f"Alert created: {alert_type} [{severity}] for {container.container_number}")
    return alert
