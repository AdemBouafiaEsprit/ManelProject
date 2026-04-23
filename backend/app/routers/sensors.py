from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from datetime import datetime, timezone, timedelta
from uuid import UUID
from app.core.database import get_db
from app.models.container import Container
from app.models.sensor import SensorReading
from app.routers.auth import get_current_user
from app.models.user import User

router = APIRouter(prefix="/sensors", tags=["Sensors"])


@router.get("/live", response_model=list[dict])
async def get_live_readings(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Latest sensor reading for every active container."""
    result = await db.execute(
        select(Container).where(Container.status.in_(["active", "critical"]))
    )
    containers = result.scalars().all()
    live = []
    for c in containers:
        res = await db.execute(
            select(SensorReading)
            .where(SensorReading.container_id == c.id)
            .order_by(desc(SensorReading.time))
            .limit(1)
        )
        reading = res.scalar_one_or_none()
        if reading:
            live.append({
                "container_id": str(c.id),
                "container_number": c.container_number,
                "commodity": c.commodity,
                "status": c.status,
                "slot_lat": c.slot_lat,
                "slot_lng": c.slot_lng,
                "block": c.block,
                "row_num": c.row_num,
                "bay": c.bay,
                "target_temp": c.target_temp,
                "temperature": reading.temperature,
                "power_consumption": reading.power_consumption,
                "door_status": reading.door_status,
                "compressor_status": reading.compressor_status,
                "vibration_level": reading.vibration_level,
                "supply_voltage": reading.supply_voltage,
                "time": reading.time.isoformat(),
            })
    return live


@router.get("/{container_id}/chart")
async def get_chart_data(
    container_id: UUID,
    hours: int = Query(24, ge=1, le=168),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Return sensor time-series formatted for ApexCharts."""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
    result = await db.execute(
        select(SensorReading)
        .where(
            SensorReading.container_id == container_id,
            SensorReading.time >= cutoff,
        )
        .order_by(SensorReading.time)
    )
    readings = result.scalars().all()

    # Downsample to max 300 points for chart performance
    if len(readings) > 300:
        step = len(readings) // 300
        readings = readings[::step]

    timestamps = [r.time.isoformat() for r in readings]

    return {
        "timestamps": timestamps,
        "temperature": [r.temperature for r in readings],
        "power_consumption": [r.power_consumption for r in readings],
        "vibration_level": [r.vibration_level for r in readings],
        "supply_voltage": [r.supply_voltage for r in readings],
        "door_status": [r.door_status for r in readings],
        "compressor_status": [r.compressor_status for r in readings],
    }
