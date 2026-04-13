import asyncio
from sqlalchemy import text
from app.core.database import AsyncSessionLocal
import bcrypt

async def main():
    new_hash = bcrypt.hashpw(b"admin123", bcrypt.gensalt()).decode("utf-8")
    async with AsyncSessionLocal() as db:
        await db.execute(text(f"UPDATE users SET hashed_password = '{new_hash}'"))
        await db.commit()
    print("Passwords updated successfully to admin123")

if __name__ == "__main__":
    asyncio.run(main())
