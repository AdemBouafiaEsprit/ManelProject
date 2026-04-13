import asyncio
import traceback
import sys
import os

from sqlalchemy import text, select
from app.core.database import engine, AsyncSessionLocal
from app.models.block import Block
from app.schemas.schemas import BlockOut

async def diagnose():
    print(">>> Diagnosis Start <<<", flush=True)
    async with AsyncSessionLocal() as db:
        try:
            print("1. Checking 'blocks' table columns...", flush=True)
            async with engine.connect() as conn:
                res = await conn.execute(text("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'blocks';"))
                cols = res.fetchall()
                print(f"   Success! Columns: {cols}", flush=True)
                
            print("2. Querying actual Block objects...", flush=True)
            result = await db.execute(select(Block))
            db_blocks = result.scalars().all()
            print(f"   Found {len(db_blocks)} block(s) in DB.", flush=True)
            
            if db_blocks:
                print("3. Validating the first DB block...", flush=True)
                # This is common source of 500s — validation failure on ORM object
                try:
                    v = BlockOut.model_validate(db_blocks[0])
                    print(f"   Successful validation: {v.block_id}", flush=True)
                except Exception as ve:
                    print(f"   FAILED Validation! {ve}", flush=True)
                    # Print full dict to see what's wrong
                    print(f"   Data: {db_blocks[0].__dict__}", flush=True)
                    raise
            
            print(">>> ALL CHECKS PASSED <<<", flush=True)
        except Exception as e:
             print(f"--- FAILED DIAGNOSIS: {type(e).__name__} ---", flush=True)
             print(str(e), flush=True)
             traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(diagnose())
