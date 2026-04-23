"""
Run once to add SHOCK_DETECTED to the alert_type CHECK constraint.
Usage:  python migrate_add_shock_alert.py
"""
import asyncio
from sqlalchemy import text
from app.core.database import engine


async def migrate():
    async with engine.begin() as conn:
        print("  → Dropping old alert_type constraint...", end=" ", flush=True)
        await conn.execute(text(
            "ALTER TABLE alerts DROP CONSTRAINT IF EXISTS alerts_alert_type_check"
        ))
        print("✓")

        print("  → Adding updated alert_type constraint...", end=" ", flush=True)
        await conn.execute(text("""
            ALTER TABLE alerts ADD CONSTRAINT alerts_alert_type_check
            CHECK (alert_type IN (
                'TEMP_EXCURSION', 'POWER_FAILURE', 'COMPRESSOR_FAULT',
                'HIGH_RISK_PREDICTED', 'DOOR_OPEN',
                'VOLTAGE_DROP', 'COMPLETE_FAILURE', 'VIBRATION_ANOMALY',
                'SHOCK_DETECTED'
            ))
        """))
        print("✓")

    print("\n✅ Migration complete: SHOCK_DETECTED alert type added.")


if __name__ == "__main__":
    asyncio.run(migrate())
