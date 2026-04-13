import asyncio
import traceback
import os
from sqlalchemy import inspect, text
from app.core.database import engine

async def check():
    print("--- DB DIAGNOSIS ---", flush=True)
    print(f"URL: {os.environ.get('DATABASE_URL')}", flush=True)
    try:
        async with engine.connect() as conn:
            print("1. Connection established.", flush=True)
            res = await conn.execute(text("SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public';"))
            tables = [row[0] for row in res.fetchall()]
            print(f">>> TABLES IN DB: {tables}", flush=True)
            
            if 'blocks' in tables:
                print("2. 'blocks' table exists. Checking schema...", flush=True)
                res = await conn.execute(text("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'blocks';"))
                cols = res.fetchall()
                print(f"   Columns: {cols}", flush=True)
            else:
                print("!!! ERROR: 'blocks' table is MISSING! !!!", flush=True)
                
    except Exception as e:
        print(f"--- FAILED DIAGNOSIS: {type(e).__name__} ---", flush=True)
        print(str(e), flush=True)
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(check())
