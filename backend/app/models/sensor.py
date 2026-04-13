import uuid
from sqlalchemy import Column, Float, Boolean, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from app.core.database import Base


class SensorReading(Base):
    __tablename__ = "sensor_readings"

    time = Column(DateTime(timezone=True), primary_key=True, server_default=func.now())
    container_id = Column(UUID(as_uuid=True), ForeignKey("containers.id", ondelete="CASCADE"), primary_key=True)
    temperature = Column(Float)
    humidity = Column(Float)
    power_consumption = Column(Float)
    door_status = Column(Boolean, default=False)
    compressor_status = Column(Boolean, default=True)
    vibration_level = Column(Float)
    supply_voltage = Column(Float)
