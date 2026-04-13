import uuid
from sqlalchemy import Column, String, Float, Integer, func, DateTime
from sqlalchemy.dialects.postgresql import UUID
from app.core.database import Base


class Block(Base):
    __tablename__ = "blocks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    block_id = Column(String(10), unique=True, nullable=False)
    name = Column(String(100), nullable=False)
    rows = Column(Integer, default=10)
    bays = Column(Integer, default=20)
    tiers = Column(Integer, default=4)
    color = Column(String(7), default="#E6F1FB")
    stroke = Column(String(7), default="#0369A1")
    
    # Coordinates (bounds)
    lat_min = Column(Float, nullable=False)
    lat_max = Column(Float, nullable=False)
    lng_min = Column(Float, nullable=False)
    lng_max = Column(Float, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
