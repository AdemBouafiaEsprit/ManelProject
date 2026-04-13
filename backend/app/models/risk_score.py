import uuid
from sqlalchemy import Column, String, Float, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID, JSONB
from app.core.database import Base


class RiskScore(Base):
    __tablename__ = "risk_scores"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    container_id = Column(UUID(as_uuid=True), ForeignKey("containers.id", ondelete="CASCADE"))
    scored_at = Column(DateTime(timezone=True), server_default=func.now())
    risk_level = Column(String(10), nullable=False)
    risk_score = Column(Float)
    predicted_failure_in_hours = Column(Float)
    forecast_temperatures = Column(JSONB)
    anomaly_score = Column(Float)
    top_factors = Column(JSONB)
    model_version = Column(String(20), default="v1.0")
