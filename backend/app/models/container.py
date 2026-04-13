import uuid
from sqlalchemy import Column, String, Float, Integer, Boolean, DateTime, func
from sqlalchemy.dialects.postgresql import UUID
from app.core.database import Base


class Container(Base):
    __tablename__ = "containers"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    container_number = Column(String(20), unique=True, nullable=False)
    owner = Column(String(100))
    commodity = Column(String(100), nullable=False)
    target_temp = Column(Float, nullable=False)
    target_humidity = Column(Float)
    tolerance = Column(Float, default=2.0)
    arrival_date = Column(DateTime(timezone=True))
    departure_date = Column(DateTime(timezone=True))
    status = Column(String(20), default="active")

    # Position
    block = Column(String(10))
    row_num = Column(Integer)
    bay = Column(Integer)
    tier = Column(Integer)
    slot_lat = Column(Float)
    slot_lng = Column(Float)
    ecp_id = Column(String(20))

    created_at = Column(DateTime(timezone=True), server_default=func.now())
