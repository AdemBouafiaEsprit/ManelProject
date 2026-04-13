"""
ML Service — XGBoost risk scoring + rule-based fallback.
Provides risk scores and simple temperature forecasts.
"""
import os
import logging
import numpy as np
from typing import Optional
from datetime import datetime, timezone, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from app.models.sensor import SensorReading
from app.models.container import Container
from app.models.risk_score import RiskScore

logger = logging.getLogger(__name__)

RISK_LEVELS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"]
MODEL_PATH = os.path.join(os.path.dirname(__file__), "../ml/models")


def _compute_features(readings: list[SensorReading], container: Container) -> Optional[dict]:
    """Compute rolling features from the last N sensor readings."""
    if len(readings) < 5:
        return None

    temps = [r.temperature for r in readings if r.temperature is not None]
    powers = [r.power_consumption for r in readings if r.power_consumption is not None]
    humidities = [r.humidity for r in readings if r.humidity is not None]

    if not temps:
        return None

    target = container.target_temp
    tolerance = container.tolerance or 2.0

    temp_deviation = np.mean(temps) - target
    temp_std = float(np.std(temps)) if len(temps) > 1 else 0
    temp_trend = float(np.polyfit(range(len(temps)), temps, 1)[0]) if len(temps) > 1 else 0

    door_opens = sum(1 for r in readings if r.door_status)
    compressor_cycles = sum(
        1 for i in range(1, len(readings))
        if readings[i].compressor_status != readings[i - 1].compressor_status
    )
    compressor_off_count = sum(1 for r in readings if not r.compressor_status)

    commodity_sensitivity = {
        "Pharmaceutical": 4,
        "Dairy Products": 3,
        "Meat Products": 3,
        "Ice Cream": 3,
        "Frozen Fish": 2,
        "Tropical Fruits": 2,
        "Fresh Vegetables": 1,
    }.get(container.commodity, 2)

    power_anomaly = 0
    if len(powers) > 3:
        avg_power = np.mean(powers[:-3])
        if avg_power > 0:
            recent_power = np.mean(powers[-3:])
            power_anomaly = (recent_power - avg_power) / avg_power

    return {
        "temp_deviation": temp_deviation,
        "temp_trend": temp_trend,
        "temp_std": temp_std,
        "humidity_deviation": (np.mean(humidities) - (container.target_humidity or 80)) if humidities else 0,
        "power_anomaly_score": float(power_anomaly),
        "door_open_count": door_opens,
        "compressor_cycles": compressor_cycles,
        "compressor_off_count": compressor_off_count,
        "commodity_sensitivity": commodity_sensitivity,
        "tolerance": tolerance,
    }


def _rule_based_score(features: dict) -> tuple[str, float, Optional[float]]:
    """Fallback scoring when ML model is unavailable."""
    score = 0.0
    tolerance = features.get("tolerance", 2.0)
    temp_dev = abs(features["temp_deviation"])

    # Temperature deviation component
    if temp_dev > tolerance * 3:
        score += 0.5
    elif temp_dev > tolerance * 2:
        score += 0.3
    elif temp_dev > tolerance * 1.5:
        score += 0.15

    # Rising temperature trend
    if features["temp_trend"] > 0.05:
        score += min(0.2, features["temp_trend"] * 2)

    # Compressor off
    if features["compressor_off_count"] > 0:
        score += 0.25

    # Door open
    if features["door_open_count"] > 0:
        score += 0.1

    # Power anomaly
    if features["power_anomaly_score"] > 0.3:
        score += 0.1

    # Commodity sensitivity multiplier
    sensitivity = features.get("commodity_sensitivity", 2)
    score = min(1.0, score * (1 + (sensitivity - 2) * 0.1))

    if score >= 0.75:
        level = "CRITICAL"
        failure_hours = max(0.5, 6 * (1 - score))
    elif score >= 0.5:
        level = "HIGH"
        failure_hours = 6 + (0.75 - score) * 30
    elif score >= 0.25:
        level = "MEDIUM"
        failure_hours = None
    else:
        level = "LOW"
        failure_hours = None

    return level, round(score, 3), round(failure_hours, 1) if failure_hours else None


def _simple_temp_forecast(readings: list[SensorReading], steps: int = 12) -> list[float]:
    """Simple linear extrapolation for temperature forecast (LSTM fallback)."""
    temps = [r.temperature for r in readings[-20:] if r.temperature is not None]
    if len(temps) < 3:
        return []

    x = np.arange(len(temps))
    coeffs = np.polyfit(x, temps, 1)
    forecast = []
    for i in range(1, steps + 1):
        pred = coeffs[0] * (len(temps) + i) + coeffs[1]
        forecast.append(round(float(pred), 2))
    return forecast


async def score_container(
    container: Container, db: AsyncSession
) -> Optional[RiskScore]:
    """Score a single container and persist the result."""
    # Get last 60 readings (~30 minutes at 30s interval)
    cutoff = datetime.now(timezone.utc) - timedelta(hours=1)
    result = await db.execute(
        select(SensorReading)
        .where(
            SensorReading.container_id == container.id,
            SensorReading.time >= cutoff,
        )
        .order_by(SensorReading.time)
    )
    readings = result.scalars().all()

    if not readings:
        return None

    features = _compute_features(list(readings), container)
    if not features:
        return None

    # Try to load XGBoost model
    try:
        import joblib
        model_file = os.path.join(MODEL_PATH, "xgboost_risk.pkl")
        if os.path.exists(model_file):
            model = joblib.load(model_file)
            X = np.array([[
                features["temp_deviation"],
                features["temp_trend"],
                features["temp_std"],
                features["humidity_deviation"],
                features["power_anomaly_score"],
                features["door_open_count"],
                features["compressor_cycles"],
                0,  # hours_since_arrival placeholder
                features["commodity_sensitivity"],
            ]])
            proba = model.predict_proba(X)[0]
            level_idx = int(np.argmax(proba))
            risk_level = RISK_LEVELS[level_idx]
            risk_score = float(proba[level_idx])
            failure_hours = None
            if level_idx >= 2:  # HIGH or CRITICAL
                failure_hours = round(max(0.5, 6 * (1 - risk_score)), 1)
        else:
            raise FileNotFoundError("Model not found")
    except Exception:
        risk_level, risk_score, failure_hours = _rule_based_score(features)

    forecast = _simple_temp_forecast(list(readings))

    top_factors = sorted(
        [
            {"factor": "Temperature Deviation", "value": round(abs(features["temp_deviation"]), 2)},
            {"factor": "Temperature Trend (slope)", "value": round(features["temp_trend"], 4)},
            {"factor": "Compressor Faults", "value": features["compressor_off_count"]},
            {"factor": "Door Open Events", "value": features["door_open_count"]},
            {"factor": "Power Anomaly Score", "value": round(features["power_anomaly_score"], 3)},
        ],
        key=lambda x: abs(x["value"]),
        reverse=True,
    )[:3]

    score_record = RiskScore(
        container_id=container.id,
        risk_level=risk_level,
        risk_score=risk_score,
        predicted_failure_in_hours=failure_hours,
        forecast_temperatures=forecast,
        anomaly_score=None,
        top_factors=top_factors,
        model_version="rule-v1.0" if "rule" in str(type(risk_level)) else "xgb-v1.0",
    )
    db.add(score_record)
    await db.flush()
    return score_record


async def score_all_containers(db: AsyncSession):
    """Score all active containers — called by APScheduler."""
    from app.services.websocket_manager import ws_manager
    result = await db.execute(
        select(Container).where(Container.status.in_(["active", "critical"]))
    )
    containers = result.scalars().all()

    for container in containers:
        try:
            score = await score_container(container, db)
            if score:
                await ws_manager.publish_to_redis({
                    "type": "risk_update",
                    "container_id": str(container.id),
                    "container_number": container.container_number,
                    "data": {
                        "risk_level": score.risk_level,
                        "risk_score": score.risk_score,
                        "predicted_failure_in_hours": score.predicted_failure_in_hours,
                    }
                })
                # Update container status if CRITICAL
                if score.risk_level == "CRITICAL" and container.status != "critical":
                    container.status = "critical"
                elif score.risk_level in ["LOW", "MEDIUM"] and container.status == "critical":
                    container.status = "active"
        except Exception as e:
            logger.error(f"Scoring error for {container.container_number}: {e}")

    await db.commit()
    logger.info(f"Scored {len(containers)} containers")
