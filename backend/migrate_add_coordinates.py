"""
Run once to add the `coordinates` column to the blocks table.
Usage:  python migrate_add_coordinates.py
"""
import asyncio
from sqlalchemy import text
from app.core.database import engine


async def migrate():
    async with engine.begin() as conn:
        await conn.execute(
            text("ALTER TABLE blocks ADD COLUMN IF NOT EXISTS coordinates JSONB")
        )
    print("✅ Migration complete: blocks.coordinates column added.")


if __name__ == "__main__":
    asyncio.run(migrate())
