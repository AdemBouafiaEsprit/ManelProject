import asyncio
from app.core.database import engine, Base
# Import all models to ensure they're registered with Base
from app.models.user import User
from app.models.container import Container
from app.models.sensor import SensorReading
from app.models.risk_score import RiskScore
from app.models.alert import Alert
from app.models.block import Block

async def init_db():
    async with engine.begin() as conn:
        # This will create all tables that don't exist yet
        await conn.run_sync(Base.metadata.create_all)
    print("Database tables initialized successfully.")

if __name__ == "__main__":
    asyncio.run(init_db())
