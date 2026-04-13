import asyncio
from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.models.block import Block

DEFAULT_BLOCKS = [
    {
        "block_id": "A", "name": "Block A — Reefer Zone 1",
        "rows": 10, "bays": 20, "tiers": 4,
        "color": "#E6F1FB", "stroke": "#0369A1",
        "lat_min": 36.7965, "lat_max": 36.8005,
        "lng_min": 10.232, "lng_max": 10.242
    },
    {
        "block_id": "B", "name": "Block B — Reefer Zone 2",
        "rows": 10, "bays": 20, "tiers": 4,
        "color": "#E1F5EE", "stroke": "#15803D",
        "lat_min": 36.8010, "lat_max": 36.8050,
        "lng_min": 10.232, "lng_max": 10.242
    },
    {
        "block_id": "C", "name": "Block C — Cold Chain Priority",
        "rows": 6, "bays": 15, "tiers": 3,
        "color": "#EEEDFE", "stroke": "#7C3AED",
        "lat_min": 36.7965, "lat_max": 36.8050,
        "lng_min": 10.244, "lng_max": 10.252
    },
]

async def seed():
    async with AsyncSessionLocal() as db:
        # Check if already seeded
        result = await db.execute(select(Block))
        if result.scalars().first():
            print("Blocks already seeded.")
            return

        for b_data in DEFAULT_BLOCKS:
            block = Block(**b_data)
            db.add(block)
        
        await db.commit()
        print("Successfully seeded blocks!")

if __name__ == "__main__":
    asyncio.run(seed())
