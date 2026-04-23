"""
Run once to remove all humidity data from the live database.
Usage:  python migrate_remove_humidity.py
"""
import asyncio
from sqlalchemy import text
from app.core.database import engine


STEPS = [
    # 1. Drop the continuous aggregate policy first (it references humidity column)
    ("Remove continuous aggregate policy",
     "SELECT remove_continuous_aggregate_policy('hourly_sensor_stats', if_not_exists => TRUE)"),

    # 2. Drop the continuous aggregate view (references humidity)
    ("Drop hourly_sensor_stats view",
     "DROP MATERIALIZED VIEW IF EXISTS hourly_sensor_stats CASCADE"),

    # 3. Remove target_humidity from containers
    ("Drop target_humidity from containers",
     "ALTER TABLE containers DROP COLUMN IF EXISTS target_humidity"),

    # 4. Remove humidity from sensor_readings (TimescaleDB handles hypertable columns)
    ("Drop humidity from sensor_readings",
     "ALTER TABLE sensor_readings DROP COLUMN IF EXISTS humidity"),

    # 5. Delete any existing HUMIDITY_DEVIATION alerts
    ("Delete HUMIDITY_DEVIATION alerts",
     "DELETE FROM alerts WHERE alert_type = 'HUMIDITY_DEVIATION'"),

    # 6. Update the alert_type CHECK constraint to remove HUMIDITY_DEVIATION
    ("Drop old alert_type constraint",
     "ALTER TABLE alerts DROP CONSTRAINT IF EXISTS alerts_alert_type_check"),

    ("Add updated alert_type constraint",
     """ALTER TABLE alerts ADD CONSTRAINT alerts_alert_type_check
        CHECK (alert_type IN (
            'TEMP_EXCURSION', 'POWER_FAILURE', 'COMPRESSOR_FAULT',
            'HIGH_RISK_PREDICTED', 'DOOR_OPEN',
            'VOLTAGE_DROP', 'COMPLETE_FAILURE', 'VIBRATION_ANOMALY'
        ))"""),

    # 7. Recreate hourly_sensor_stats without humidity
    ("Recreate hourly_sensor_stats without humidity",
     """CREATE MATERIALIZED VIEW IF NOT EXISTS hourly_sensor_stats
        WITH (timescaledb.continuous) AS
        SELECT
          time_bucket('1 hour', time) AS bucket,
          container_id,
          AVG(temperature) AS avg_temp,
          MAX(temperature) AS max_temp,
          MIN(temperature) AS min_temp,
          AVG(power_consumption) AS avg_power,
          COUNT(*) AS reading_count
        FROM sensor_readings
        GROUP BY bucket, container_id"""),

    ("Restore continuous aggregate refresh policy",
     """SELECT add_continuous_aggregate_policy('hourly_sensor_stats',
            start_offset => INTERVAL '3 days',
            end_offset => INTERVAL '1 hour',
            schedule_interval => INTERVAL '10 minutes',
            if_not_exists => TRUE)"""),
]


async def migrate():
    # Steps 1-7 run inside a transaction
    transactional = STEPS[:-2]
    # Steps 8-9 (CREATE MATERIALIZED VIEW + policy) must run outside a transaction
    autocommit_steps = STEPS[-2:]

    async with engine.begin() as conn:
        for label, sql in transactional:
            print(f"  → {label}...", end=" ", flush=True)
            await conn.execute(text(sql))
            print("✓")

    # Use AUTOCOMMIT isolation for DDL that can't run in a transaction block
    async with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
        for label, sql in autocommit_steps:
            print(f"  → {label}...", end=" ", flush=True)
            await conn.execute(text(sql))
            print("✓")

    print("\n✅ Migration complete: humidity removed from database.")


if __name__ == "__main__":
    asyncio.run(migrate())
