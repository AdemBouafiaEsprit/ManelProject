from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from datetime import datetime, timezone, timedelta
from typing import Optional
from uuid import UUID
from app.core.database import get_db
from app.models.container import Container
from app.models.sensor import SensorReading
from app.models.risk_score import RiskScore
from app.models.alert import Alert
from app.models.container_event import ContainerEvent
from app.schemas.schemas import (
    ContainerOut, ContainerUpdate, ContainerCreate, ContainerEdit,
    SensorReadingOut, RiskScoreOut, AlertOut, IncidentReport, BulkStatusUpdate,
    ContainerEventOut,
)
from app.routers.auth import get_current_user, require_role
from app.models.user import User

router = APIRouter(prefix="/containers", tags=["Containers"])


async def _enrich_container(container: Container, db: AsyncSession) -> dict:
    """Add latest reading, risk score and alert count to container dict."""
    c = container.__dict__.copy()

    # Latest sensor reading
    res = await db.execute(
        select(SensorReading)
        .where(SensorReading.container_id == container.id)
        .order_by(desc(SensorReading.time))
        .limit(1)
    )
    latest = res.scalar_one_or_none()
    c["latest_reading"] = SensorReadingOut.model_validate(latest) if latest else None

    # Latest risk score
    res2 = await db.execute(
        select(RiskScore)
        .where(RiskScore.container_id == container.id)
        .order_by(desc(RiskScore.scored_at))
        .limit(1)
    )
    risk = res2.scalar_one_or_none()
    c["latest_risk"] = RiskScoreOut.model_validate(risk) if risk else None

    # Active alerts count
    res3 = await db.execute(
        select(func.count()).where(
            Alert.container_id == container.id,
            Alert.is_active == True,
        )
    )
    c["active_alerts_count"] = res3.scalar() or 0
    return c


@router.get("", response_model=list[ContainerOut])
async def list_containers(
    status: Optional[str] = None,
    block: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = select(Container)
    if status:
        q = q.where(Container.status == status)
    if block:
        q = q.where(Container.block == block)
    q = q.order_by(Container.container_number)
    result = await db.execute(q)
    containers = result.scalars().all()
    enriched = [await _enrich_container(c, db) for c in containers]
    return [ContainerOut.model_validate(e) for e in enriched]


@router.get("/{container_id}", response_model=ContainerOut)
async def get_container(
    container_id: UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(Container).where(Container.id == container_id))
    container = result.scalar_one_or_none()
    if not container:
        raise HTTPException(status_code=404, detail="Container not found")
    return ContainerOut.model_validate(await _enrich_container(container, db))


@router.get("/{container_id}/history", response_model=list[SensorReadingOut])
async def get_container_history(
    container_id: UUID,
    hours: int = Query(24, ge=1, le=168),
    interval: str = Query("raw", description="raw | 1h"),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
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
    # Downsample if many readings
    if len(readings) > 500:
        step = len(readings) // 500
        readings = readings[::step]
    return [SensorReadingOut.model_validate(r) for r in readings]


@router.get("/{container_id}/risk", response_model=RiskScoreOut)
async def get_container_risk(
    container_id: UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(
        select(RiskScore)
        .where(RiskScore.container_id == container_id)
        .order_by(desc(RiskScore.scored_at))
        .limit(1)
    )
    risk = result.scalar_one_or_none()
    if not risk:
        raise HTTPException(status_code=404, detail="No risk score available")
    return RiskScoreOut.model_validate(risk)


@router.put("/{container_id}/status", response_model=ContainerOut)
async def update_container_status(
    container_id: UUID,
    update: ContainerUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role("admin", "supervisor")),
):
    result = await db.execute(select(Container).where(Container.id == container_id))
    container = result.scalar_one_or_none()
    if not container:
        raise HTTPException(status_code=404, detail="Container not found")
    if update.status:
        container.status = update.status
    if update.block:
        container.block = update.block
    await db.commit()
    return ContainerOut.model_validate(await _enrich_container(container, db))


@router.put("/{container_id}", response_model=ContainerOut)
async def edit_container(
    container_id: UUID,
    update: ContainerEdit,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("admin", "supervisor")),
):
    result = await db.execute(select(Container).where(Container.id == container_id))
    container = result.scalar_one_or_none()
    if not container:
        raise HTTPException(status_code=404, detail="Container not found")

    if update.container_number is not None:
        import re
        if not re.match(r'^[A-Z]{4}\d{7}$', update.container_number):
            raise HTTPException(
                status_code=422,
                detail="Invalid container number. Required format: 4 letters + 7 digits (e.g. CMAU7821697)",
            )
        dup = await db.execute(
            select(Container).where(
                Container.container_number == update.container_number,
                Container.id != container_id,
            )
        )
        if dup.scalar_one_or_none():
            raise HTTPException(
                status_code=400,
                detail=f"Container {update.container_number} already exists",
            )
        container.container_number = update.container_number

    old_status = container.status
    for field in ["owner", "commodity", "target_temp", "tolerance", "status", "block", "row_num", "bay", "tier", "ecp_id"]:
        val = getattr(update, field)
        if val is not None:
            setattr(container, field, val)

    if update.status is not None and update.status != old_status:
        db.add(ContainerEvent(
            container_id=container.id,
            event_type="STATUS_CHANGED",
            description=f"Status changed from {old_status} to {update.status}.",
            username=current_user.username,
        ))

    await db.commit()
    return ContainerOut.model_validate(await _enrich_container(container, db))


@router.post("/{container_id}/report-incident", response_model=AlertOut, status_code=201)
async def report_incident(
    container_id: UUID,
    payload: IncidentReport,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Container).where(Container.id == container_id))
    container = result.scalar_one_or_none()
    if not container:
        raise HTTPException(status_code=404, detail="Container not found")

    slot = f"{container.block}-{container.row_num:02d}-{container.bay:02d}"
    alert = Alert(
        container_id=container_id,
        alert_type="SHOCK_DETECTED",
        severity="WARNING",
        message=f"MANUALLY REPORTED: Physical incident on {container.container_number}. {payload.description}",
        recommended_action=(
            f"Inspect container {container.container_number} at slot {slot} "
            f"(ECP {container.ecp_id}) for structural damage and cargo integrity."
        ),
        is_active=True,
    )
    db.add(alert)
    db.add(ContainerEvent(
        container_id=container_id,
        event_type="INCIDENT_REPORTED",
        description=f"Physical incident reported: {payload.description}",
        username=current_user.username,
    ))
    await db.commit()
    await db.refresh(alert)
    return AlertOut.model_validate(alert)


@router.post("", response_model=ContainerOut, status_code=201)
async def create_container(
    payload: ContainerCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("admin", "supervisor")),
):
    import re
    if not re.match(r'^[A-Z]{4}\d{7}$', payload.container_number):
        raise HTTPException(
            status_code=422,
            detail="Invalid container number. Required format: 4 letters + 7 digits (e.g. CMAU7821697)",
        )

    result = await db.execute(
        select(Container).where(Container.container_number == payload.container_number)
    )
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=400,
            detail=f"Container with number {payload.container_number} already exists",
        )

    new_container = Container(**payload.model_dump())
    db.add(new_container)
    await db.flush()
    db.add(ContainerEvent(
        container_id=new_container.id,
        event_type="CREATED",
        description=f"Container {new_container.container_number} created.",
        username=current_user.username,
    ))
    await db.commit()
    await db.refresh(new_container)

    return ContainerOut.model_validate(await _enrich_container(new_container, db))


@router.post("/bulk-status", status_code=200)
async def bulk_update_status(
    payload: BulkStatusUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("admin", "supervisor")),
):
    result = await db.execute(
        select(Container).where(Container.id.in_(payload.container_ids))
    )
    containers = result.scalars().all()
    for c in containers:
        old_status = c.status
        c.status = payload.status
        db.add(ContainerEvent(
            container_id=c.id,
            event_type="STATUS_CHANGED",
            description=f"Status changed from {old_status} to {payload.status} (bulk update).",
            username=current_user.username,
        ))
    await db.commit()
    return {"updated": len(containers)}


@router.get("/{container_id}/timeline")
async def get_container_timeline(
    container_id: UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    res_events = await db.execute(
        select(ContainerEvent)
        .where(ContainerEvent.container_id == container_id)
        .order_by(desc(ContainerEvent.happened_at))
    )
    events = res_events.scalars().all()

    res_alerts = await db.execute(
        select(Alert)
        .where(Alert.container_id == container_id)
        .order_by(desc(Alert.triggered_at))
    )
    alerts = res_alerts.scalars().all()

    timeline = []
    for e in events:
        timeline.append({
            "kind": "event",
            "event_type": e.event_type,
            "description": e.description,
            "username": e.username,
            "happened_at": e.happened_at,
        })
    for a in alerts:
        timeline.append({
            "kind": "alert",
            "event_type": a.alert_type,
            "description": a.message,
            "username": None,
            "happened_at": a.triggered_at,
        })

    timeline.sort(key=lambda x: x["happened_at"], reverse=True)
    return timeline
