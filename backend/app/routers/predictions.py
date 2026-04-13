from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from uuid import UUID
from app.core.database import get_db
from app.models.container import Container
from app.models.risk_score import RiskScore
from app.schemas.schemas import RiskScoreOut
from app.routers.auth import get_current_user, require_role
from app.models.user import User
from app.services.ml_service import score_container, score_all_containers

router = APIRouter(prefix="/predictions", tags=["Predictions"])


@router.get("", response_model=list[dict])
async def get_all_predictions(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Latest risk score for every container."""
    result = await db.execute(select(Container).order_by(Container.container_number))
    containers = result.scalars().all()

    predictions = []
    for c in containers:
        res = await db.execute(
            select(RiskScore)
            .where(RiskScore.container_id == c.id)
            .order_by(desc(RiskScore.scored_at))
            .limit(1)
        )
        risk = res.scalar_one_or_none()
        predictions.append({
            "container_id": str(c.id),
            "container_number": c.container_number,
            "commodity": c.commodity,
            "status": c.status,
            "risk_level": risk.risk_level if risk else "LOW",
            "risk_score": risk.risk_score if risk else 0.0,
            "predicted_failure_in_hours": risk.predicted_failure_in_hours if risk else None,
            "scored_at": risk.scored_at.isoformat() if risk else None,
        })
    return predictions


@router.get("/{container_id}", response_model=RiskScoreOut)
async def get_prediction(
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
        raise HTTPException(status_code=404, detail="No prediction available")
    return RiskScoreOut.model_validate(risk)


@router.post("/trigger")
async def trigger_scoring(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role("admin", "supervisor")),
):
    """Manually trigger ML scoring for all containers."""
    await score_all_containers(db)
    return {"message": "Scoring triggered for all active containers"}


@router.post("/trigger/{container_id}")
async def trigger_single_scoring(
    container_id: UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(Container).where(Container.id == container_id))
    container = result.scalar_one_or_none()
    if not container:
        raise HTTPException(status_code=404, detail="Container not found")
    score = await score_container(container, db)
    await db.commit()
    if not score:
        raise HTTPException(status_code=400, detail="Not enough data to score")
    return RiskScoreOut.model_validate(score)
