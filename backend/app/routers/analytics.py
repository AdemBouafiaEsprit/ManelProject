from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from datetime import datetime, timezone, timedelta
from app.core.database import get_db
from app.models.container import Container
from app.models.alert import Alert
from app.models.risk_score import RiskScore
from app.models.sensor import SensorReading
from app.routers.auth import get_current_user
from app.models.user import User

router = APIRouter(prefix="/analytics", tags=["Analytics"])


@router.get("/summary")
async def get_summary(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    # Active containers
    res = await db.execute(
        select(func.count()).where(Container.status.in_(["active", "critical"]))
    )
    total_active = res.scalar() or 0

    # Critical alerts
    res2 = await db.execute(
        select(func.count()).where(Alert.severity == "CRITICAL", Alert.is_active == True)
    )
    critical_alerts = res2.scalar() or 0

    # Warning alerts
    res_warn = await db.execute(
        select(func.count()).where(Alert.severity == "WARNING", Alert.is_active == True)
    )
    warning_alerts = res_warn.scalar() or 0

    # Avg risk score
    res3 = await db.execute(
        select(func.avg(RiskScore.risk_score)).where(
            RiskScore.scored_at >= datetime.now(timezone.utc) - timedelta(hours=1)
        )
    )
    avg_risk = float(res3.scalar() or 0.15)

    # Offline containers
    res4 = await db.execute(
        select(func.count()).where(Container.status == "offline")
    )
    offline = res4.scalar() or 0

    # Losses prevented estimate (each acknowledged CRITICAL = $850 avg)
    res5 = await db.execute(
        select(func.count()).where(
            Alert.severity == "CRITICAL",
            Alert.acknowledged_at.isnot(None),
            Alert.triggered_at >= datetime.now(timezone.utc) - timedelta(days=1),
        )
    )
    interventions_today = res5.scalar() or 0
    losses_prevented = interventions_today * 850.0

    return {
        "total_active_containers": total_active,
        "critical_alerts": critical_alerts,
        "warning_alerts": warning_alerts,
        "avg_risk_score": round(avg_risk, 3),
        "losses_prevented_usd": losses_prevented,
        "offline_containers": offline,
    }


@router.get("/alerts-over-time")
async def get_alerts_over_time(
    days: int = 30,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    result = await db.execute(
        select(Alert)
        .where(Alert.triggered_at >= cutoff)
        .order_by(Alert.triggered_at)
    )
    alerts = result.scalars().all()

    # Group by day + severity
    daily: dict = {}
    for alert in alerts:
        day = alert.triggered_at.strftime("%Y-%m-%d")
        if day not in daily:
            daily[day] = {"INFO": 0, "WARNING": 0, "CRITICAL": 0}
        daily[day][alert.severity] = daily[day].get(alert.severity, 0) + 1

    return {
        "categories": sorted(daily.keys()),
        "series": [
            {"name": "INFO", "data": [daily.get(d, {}).get("INFO", 0) for d in sorted(daily.keys())]},
            {"name": "WARNING", "data": [daily.get(d, {}).get("WARNING", 0) for d in sorted(daily.keys())]},
            {"name": "CRITICAL", "data": [daily.get(d, {}).get("CRITICAL", 0) for d in sorted(daily.keys())]},
        ]
    }


@router.get("/risk-distribution")
async def get_risk_distribution(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    cutoff = datetime.now(timezone.utc) - timedelta(hours=2)
    result = await db.execute(
        select(RiskScore.risk_level, func.count().label("count"))
        .where(RiskScore.scored_at >= cutoff)
        .group_by(RiskScore.risk_level)
    )
    rows = result.all()
    dist = {r.risk_level: r.count for r in rows}
    return {
        "labels": ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
        "series": [
            dist.get("LOW", 0),
            dist.get("MEDIUM", 0),
            dist.get("HIGH", 0),
            dist.get("CRITICAL", 0),
        ]
    }


@router.get("/top-problematic")
async def get_top_problematic(
    limit: int = 5,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(
        select(
            Alert.container_id,
            func.count().label("alert_count")
        )
        .where(Alert.triggered_at >= datetime.now(timezone.utc) - timedelta(days=7))
        .group_by(Alert.container_id)
        .order_by(desc("alert_count"))
        .limit(limit)
    )
    rows = result.all()
    out = []
    for row in rows:
        res = await db.execute(
            select(Container.container_number, Container.commodity)
            .where(Container.id == row.container_id)
        )
        info = res.first()
        if info:
            out.append({
                "container_number": info.container_number,
                "commodity": info.commodity,
                "alert_count": row.alert_count,
            })
    return out


@router.get("/commodity-performance")
async def get_commodity_performance(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(Container))
    containers = result.scalars().all()

    commodity_stats: dict = {}
    for c in containers:
        com = c.commodity
        if com not in commodity_stats:
            commodity_stats[com] = {"containers": 0, "incidents": 0, "avg_risk": []}
        commodity_stats[com]["containers"] += 1

        # Latest risk
        res = await db.execute(
            select(RiskScore.risk_score)
            .where(RiskScore.container_id == c.id)
            .order_by(desc(RiskScore.scored_at))
            .limit(1)
        )
        risk = res.scalar_one_or_none()
        if risk:
            commodity_stats[com]["avg_risk"].append(risk)

        # Incidents (last 30 days)
        res2 = await db.execute(
            select(func.count()).where(
                Alert.container_id == c.id,
                Alert.triggered_at >= datetime.now(timezone.utc) - timedelta(days=30),
            )
        )
        commodity_stats[com]["incidents"] += (res2.scalar() or 0)

    rows = []
    for commodity, stats in commodity_stats.items():
        avg_risk = sum(stats["avg_risk"]) / len(stats["avg_risk"]) if stats["avg_risk"] else 0
        rows.append({
            "commodity": commodity,
            "containers": stats["containers"],
            "incidents": stats["incidents"],
            "avg_risk_score": round(avg_risk, 3),
            "estimated_losses_avoided_usd": stats["incidents"] * 350,
        })
    return sorted(rows, key=lambda x: x["incidents"], reverse=True)


@router.get("/losses-prevented")
async def get_losses_prevented(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    res = await db.execute(
        select(func.count()).where(
            Alert.severity == "CRITICAL",
            Alert.acknowledged_at.isnot(None),
        )
    )
    total_interventions = res.scalar() or 0
    return {
        "total_interventions": total_interventions,
        "estimated_losses_prevented_usd": total_interventions * 850,
        "estimated_losses_prevented_tnd": total_interventions * 850 * 3.1,
    }
