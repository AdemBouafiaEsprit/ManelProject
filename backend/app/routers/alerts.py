from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, update
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID
from app.core.database import get_db
from app.models.alert import Alert
from app.models.container import Container
from app.schemas.schemas import AlertOut
from app.routers.auth import get_current_user
from app.models.user import User

router = APIRouter(prefix="/alerts", tags=["Alerts"])


async def _enrich_alert(alert: Alert, db: AsyncSession) -> dict:
    a = alert.__dict__.copy()
    res = await db.execute(
        select(Container.container_number).where(Container.id == alert.container_id)
    )
    a["container_number"] = res.scalar_one_or_none()
    return a


@router.get("", response_model=list[AlertOut])
async def list_alerts(
    severity: Optional[str] = None,
    is_active: Optional[bool] = None,
    container_id: Optional[UUID] = None,
    limit: int = Query(50, le=200),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = select(Alert).order_by(desc(Alert.triggered_at))
    if severity:
        q = q.where(Alert.severity == severity.upper())
    if is_active is not None:
        q = q.where(Alert.is_active == is_active)
    if container_id:
        q = q.where(Alert.container_id == container_id)
    q = q.limit(limit)
    result = await db.execute(q)
    alerts = result.scalars().all()
    return [AlertOut.model_validate(await _enrich_alert(a, db)) for a in alerts]


@router.get("/{alert_id}", response_model=AlertOut)
async def get_alert(
    alert_id: UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(Alert).where(Alert.id == alert_id))
    alert = result.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    return AlertOut.model_validate(await _enrich_alert(alert, db))


@router.put("/{alert_id}/acknowledge", response_model=AlertOut)
async def acknowledge_alert(
    alert_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Alert).where(Alert.id == alert_id))
    alert = result.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    alert.acknowledged_at = datetime.now(timezone.utc)
    alert.acknowledged_by = current_user.id
    await db.commit()
    return AlertOut.model_validate(await _enrich_alert(alert, db))


@router.put("/{alert_id}/resolve", response_model=AlertOut)
async def resolve_alert(
    alert_id: UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(Alert).where(Alert.id == alert_id))
    alert = result.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    alert.resolved_at = datetime.now(timezone.utc)
    alert.is_active = False
    await db.commit()
    return AlertOut.model_validate(await _enrich_alert(alert, db))


@router.post("/bulk-acknowledge")
async def bulk_acknowledge(
    alert_ids: list[UUID],
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    now = datetime.now(timezone.utc)
    await db.execute(
        update(Alert)
        .where(Alert.id.in_(alert_ids))
        .values(acknowledged_at=now, acknowledged_by=current_user.id)
    )
    await db.commit()
    return {"acknowledged": len(alert_ids)}
