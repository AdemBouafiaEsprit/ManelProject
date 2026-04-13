import asyncio
import traceback
import sys
import os

# Ensure the app is in the path
sys.path.append(os.getcwd())

from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.models.block import Block
from app.schemas.schemas import BlockOut

async def diagnose():
    print(">>> Diagnosis Started <<<", flush=True)
    async with AsyncSessionLocal() as db:
        try:
            print("1. Looking for 'blocks' table...", flush=True)
            result = await db.execute(select(Block).limit(5))
            db_blocks = result.scalars().all()
            print(f"   Success! Found {len(db_blocks)} block(s).", flush=True)

            print("2. Testing Pydantic validation (BlockOut)...", flush=True)
            test_data = db_blocks[0] if db_blocks else {
                "id": "00000000-0000-0000-0000-000000000001",
                "block_id": "A", "name": "Fallback",
                "rows": 10, "bays": 20, "tiers": 4,
                "color": "#E6F1FB", "stroke": "#0369A1",
                "lat_min": 36.7965, "lat_max": 36.8005,
                "lng_min": 10.232, "lng_max": 10.242
            }
            
            try:
                # This should handle both ORM objects and dicts
                v = BlockOut.model_validate(test_data)
                print(f"   Success! Output: {v.model_dump().get('name')}", flush=True)
            except Exception as pe:
                print(f"   FAILED Pydantic! {pe}", flush=True)
                raise
            
            print("3. Testing GeoJSON construction loop...", flush=True)
            # Simulating the get_layout loop
            blocks_to_render = db_blocks if db_blocks else [test_data]
            for b in blocks_to_render:
                block_data = BlockOut.model_validate(b).model_dump()
                # Mock feature construction
                f = {
                    "type": "Feature",
                    "properties": {
                        "block_id": block_data.get("block_id"),
                        "rows": block_data.get("rows")
                    },
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": [[[block_data.get("lng_min"), block_data.get("lat_min")]]]
                    }
                }
            print("   Success! Layout loop looks safe.", flush=True)
            
            print(">>> ALL CHECKS PASSED <<<", flush=True)

        except Exception as e:
            print(f"\nCRITICAL ERROR: {type(e).__name__}", flush=True)
            print("-" * 40, flush=True)
            traceback.print_exc()
            print("-" * 40, flush=True)

if __name__ == "__main__":
    asyncio.run(diagnose())
