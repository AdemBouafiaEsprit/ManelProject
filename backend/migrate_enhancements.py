"""
Migration: add resolution_notes to alerts, create container_events table.
Run inside the backend container:
  docker exec -it <backend_container> python migrate_enhancements.py
"""
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from app.core.config import settings

async def run():
    engine = create_async_engine(settings.DATABASE_URL)
    async with engine.begin() as conn:
        await conn.execute(text("""
            ALTER TABLE alerts
            ADD COLUMN IF NOT EXISTS resolution_notes TEXT;
        """))

        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS container_events (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                container_id UUID NOT NULL REFERENCES containers(id) ON DELETE CASCADE,
                event_type VARCHAR(50) NOT NULL,
                description TEXT NOT NULL,
                username VARCHAR(50),
                happened_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        """))

        await conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_container_events_container_id
            ON container_events(container_id);
        """))

    await engine.dispose()
    print("Migration complete.")

if __name__ == "__main__":
    asyncio.run(run())
