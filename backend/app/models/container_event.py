import uuid
from sqlalchemy import Column, String, Text, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from app.core.database import Base


class ContainerEvent(Base):
    __tablename__ = "container_events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    container_id = Column(UUID(as_uuid=True), ForeignKey("containers.id", ondelete="CASCADE"))
    event_type = Column(String(50), nullable=False)   # CREATED | STATUS_CHANGED | INCIDENT_REPORTED
    description = Column(Text, nullable=False)
    username = Column(String(50), nullable=True)
    happened_at = Column(DateTime(timezone=True), server_default=func.now())
