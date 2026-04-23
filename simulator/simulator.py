#!/usr/bin/env python3
"""
STAM Reefer Platform — Realistic Sensor Data Simulator
Generates 25 containers with 7 commodity profiles, 5 fault scenarios.
Publishes via MQTT and/or writes directly to PostgreSQL.

Usage:
  python simulator.py --seed-history --then-realtime
  python simulator.py --realtime-only
  python simulator.py --inject-fault MSCU0042 compressor_degradation
"""

import argparse
import json
import logging
import math
import os
import random
import sys
import time
import uuid
from datetime import datetime, timezone, timedelta

import paho.mqtt.client as mqtt
import psycopg2
import psycopg2.extras

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger(__name__)

# ─── Config ───────────────────────────────────────────────────────────────────

with open(os.path.join(os.path.dirname(__file__), "simulation_config.json")) as f:
    CONFIG = json.load(f)

MQTT_HOST = os.getenv("MQTT_BROKER_HOST", "localhost")
MQTT_PORT = int(os.getenv("MQTT_BROKER_PORT", "1883"))
DB_URL = os.getenv("DATABASE_URL", "postgresql://reefer_user:reefer_pass@localhost:5432/reefer_db")

# ─── Commodity Profiles ───────────────────────────────────────────────────────

COMMODITY_PROFILES = {
    "Frozen Fish":       {"target_temp": -18.0, "tolerance": 2.0, "humidity": 85, "power_base": 4.5},
    "Fresh Vegetables":  {"target_temp":   4.0, "tolerance": 1.5, "humidity": 90, "power_base": 2.8},
    "Dairy Products":    {"target_temp":   2.0, "tolerance": 1.0, "humidity": 80, "power_base": 3.0},
    "Meat Products":     {"target_temp": -15.0, "tolerance": 2.0, "humidity": 85, "power_base": 4.2},
    "Pharmaceutical":    {"target_temp":   8.0, "tolerance": 0.5, "humidity": 60, "power_base": 2.5},
    "Tropical Fruits":   {"target_temp":  13.0, "tolerance": 2.0, "humidity": 88, "power_base": 2.6},
    "Ice Cream":         {"target_temp": -22.0, "tolerance": 1.0, "humidity": 70, "power_base": 5.0},
}

OWNERS = ["MSC Tunisia", "CMA CGM", "COTUNAV", "Maersk", "SNTT", "Tunismar"]
BLOCKS = ["A", "B", "C"]

# Lat/lng ranges per block (Radès terminal)
BLOCK_COORDS = {
    "A": {"lat": (36.7965, 36.8005), "lng": (10.232, 10.242)},
    "B": {"lat": (36.8010, 36.8050), "lng": (10.232, 10.242)},
    "C": {"lat": (36.7965, 36.8050), "lng": (10.244, 10.252)},
}

# ─── Container Generation ─────────────────────────────────────────────────────

def generate_containers(n: int = 25) -> list[dict]:
    """Generate n containers with realistic diversity."""
    commodities = list(COMMODITY_PROFILES.keys())
    containers = []
    ecp_counter = 1

    for i in range(n):
        commodity = commodities[i % len(commodities)]
        profile = COMMODITY_PROFILES[commodity]
        block = BLOCKS[i % len(BLOCKS)]
        coords = BLOCK_COORDS[block]

        prefix = random.choice(["MSCU", "GLDU", "CMAU", "MRKU", "TCKU"])
        number = f"{prefix}{str(i+1).zfill(4)}{random.randint(0,9)}"

        arrival = datetime.now(timezone.utc) - timedelta(days=random.randint(1, 15))
        departure = arrival + timedelta(days=random.randint(5, 30))

        containers.append({
            "id": str(uuid.uuid4()),
            "container_number": number,
            "owner": random.choice(OWNERS),
            "commodity": commodity,
            "target_temp": profile["target_temp"],
            "target_humidity": float(profile["humidity"]),
            "tolerance": float(profile["tolerance"]),
            "power_base": profile["power_base"],
            "arrival_date": arrival.isoformat(),
            "departure_date": departure.isoformat(),
            "status": "active",
            "block": block,
            "row_num": (i % 10) + 1,
            "bay": (i % 20) + 1,
            "tier": random.randint(1, profile.get("tiers", 3)),
            "slot_lat": round(random.uniform(*coords["lat"]), 6),
            "slot_lng": round(random.uniform(*coords["lng"]), 6),
            "ecp_id": f"ECP-{ecp_counter:03d}",
        })
        ecp_counter += 1

    return containers


# ─── Fault State Machine ──────────────────────────────────────────────────────

class ContainerState:
    def __init__(self, container: dict):
        self.meta = container
        self.current_temp = container["target_temp"] + random.uniform(-0.3, 0.3)
        self.current_power = container["power_base"] + random.uniform(-0.1, 0.1)
        self.supply_voltage = 230.0 + random.uniform(-2, 2)
        self.door_open = False
        self.compressor_on = True
        self.vibration = random.uniform(0.1, 0.5)

        self.scenario = "normal"
        self.scenario_cycles_left = 0
        self.fault_label = 0  # 0=no fault, 1=degraded, 2=fault, 3=critical
        self._shock_vibration = 0.0  # peak value for current shock event

    def maybe_inject_fault(self, fault_probability: float):
        if self.scenario == "normal" and random.random() < fault_probability:
            scenarios = list(CONFIG["scenarios"].keys())
            scenarios.remove("normal")
            self.scenario = random.choice(scenarios)
            cfg = CONFIG["scenarios"][self.scenario]
            self.scenario_cycles_left = cfg.get("duration_cycles", 20)
            logger.info(
                f"🔴 Fault injected: {self.scenario} on {self.meta['container_number']} "
                f"({self.meta['commodity']})"
            )

    def step(self) -> dict:
        """Advance simulation by one step and return sensor reading."""
        target = self.meta["target_temp"]
        tolerance = self.meta["tolerance"]
        cfg_normal = CONFIG["scenarios"]["normal"]

        if self.scenario != "normal" and self.scenario_cycles_left > 0:
            self.scenario_cycles_left -= 1
            cfg = CONFIG["scenarios"][self.scenario]

            if self.scenario == "compressor_degradation":
                self.current_temp += cfg["temp_rise_rate"] + random.uniform(-0.05, 0.1)
                self.current_power += random.uniform(0, cfg["power_spike"])
                self.vibration = min(10, self.vibration + 0.1)
                self.fault_label = 2

            elif self.scenario == "door_left_open":
                self.door_open = True
                self.current_temp += cfg["temp_rise_rate"] + random.uniform(-0.1, 0.2)
                self.fault_label = 1

            elif self.scenario == "power_fluctuation":
                if random.random() < 0.3:
                    self.supply_voltage = random.uniform(170, 200)
                    self.compressor_on = False
                else:
                    self.supply_voltage = 230 + random.uniform(-5, 5)
                    self.compressor_on = True
                if not self.compressor_on:
                    self.current_temp += 0.5
                self.fault_label = 2

            elif self.scenario == "complete_failure":
                self.compressor_on = False
                self.current_temp += cfg["temp_rise_rate"] + random.uniform(0, 0.3)
                self.supply_voltage = random.uniform(150, 180)
                self.fault_label = 3

            elif self.scenario == "vibration_anomaly":
                cfg = CONFIG["scenarios"]["vibration_anomaly"]
                self.vibration = cfg["vibration_base"] + random.uniform(
                    -cfg["vibration_noise"], cfg["vibration_noise"]
                )
                self.vibration = max(2.0, min(5.0, self.vibration))
                self.fault_label = 1

            elif self.scenario == "shock_impact":
                cfg = CONFIG["scenarios"]["shock_impact"]
                if self.scenario_cycles_left == CONFIG["scenarios"]["shock_impact"]["duration_cycles"]:
                    # First cycle: generate the spike value
                    self._shock_vibration = random.uniform(
                        cfg["vibration_spike_min"], cfg["vibration_spike_max"]
                    )
                    logger.info(
                        f"💥 Shock impact on {self.meta['container_number']}: "
                        f"vibration={self._shock_vibration:.1f}"
                    )
                self.vibration = self._shock_vibration
                self.fault_label = 2

            if self.scenario_cycles_left == 0:
                logger.info(f"✅ Fault ended on {self.meta['container_number']}, returning to normal")
                self.scenario = "normal"
                self.fault_label = 0
                self.door_open = False
                self.compressor_on = True
                self.supply_voltage = 230
                self._shock_vibration = 0.0

        else:
            # Normal operation — gentle drift back to target
            diff = target - self.current_temp
            self.current_temp += diff * 0.1 + random.uniform(
                -cfg_normal["temp_drift"], cfg_normal["temp_drift"]
            )
            self.current_power = self.meta["power_base"] + random.uniform(
                -cfg_normal["power_noise"] * 10, cfg_normal["power_noise"] * 10
            )
            self.supply_voltage = 230 + random.uniform(-cfg_normal["voltage_noise"], cfg_normal["voltage_noise"])
            self.compressor_on = True
            self.door_open = False
            # Vibration drifts back toward baseline (0.1–0.5)
            self.vibration += (0.3 - self.vibration) * 0.2 + random.uniform(-0.05, 0.05)
            self.vibration = max(0, min(1.5, self.vibration))

        return {
            "temperature": round(self.current_temp, 2),
            "power_consumption": round(max(0, self.current_power), 3),
            "door_status": self.door_open,
            "compressor_status": self.compressor_on,
            "vibration_level": round(max(0, min(10, self.vibration)), 2),
            "supply_voltage": round(self.supply_voltage, 1),
            "fault_label": self.fault_label,
            "scenario": self.scenario,
        }


# ─── Database helpers ─────────────────────────────────────────────────────────

def get_db_connection():
    return psycopg2.connect(DB_URL)


def load_containers_from_db(conn) -> list[dict]:
    """Load existing containers from the DB and enrich with profile power_base."""
    cur = conn.cursor()
    cur.execute("""
        SELECT id, container_number, commodity, target_temp, tolerance
        FROM containers
        WHERE status NOT IN ('departed')
        ORDER BY container_number
    """)
    rows = cur.fetchall()
    cur.close()
    containers = []
    for cid, cn, commodity, target_temp, tolerance in rows:
        profile = COMMODITY_PROFILES.get(commodity, {"power_base": 3.0})
        containers.append({
            "id": str(cid),
            "container_number": cn,
            "commodity": commodity,
            "target_temp": target_temp,
            "tolerance": tolerance,
            "power_base": profile.get("power_base", 3.0),
        })
    logger.info(f"✅ Loaded {len(containers)} containers from database")
    return containers


def seed_containers(containers: list[dict], conn):
    """Insert containers into PostgreSQL."""
    cur = conn.cursor()
    for c in containers:
        cur.execute("""
            INSERT INTO containers (
                id, container_number, owner, commodity,
                target_temp, tolerance,
                arrival_date, departure_date, status,
                block, row_num, bay, tier, slot_lat, slot_lng, ecp_id
            ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (container_number) DO NOTHING
        """, (
            c["id"], c["container_number"], c["owner"], c["commodity"],
            c["target_temp"], c["tolerance"],
            c["arrival_date"], c["departure_date"], c["status"],
            c["block"], c["row_num"], c["bay"], c["tier"],
            c["slot_lat"], c["slot_lng"], c["ecp_id"],
        ))
    conn.commit()
    cur.close()
    logger.info(f"✅ Seeded {len(containers)} containers")


def insert_reading(container_id: str, reading: dict, ts: datetime, conn):
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO sensor_readings (
            time, container_id, temperature,
            power_consumption, door_status, compressor_status,
            vibration_level, supply_voltage
        ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
    """, (
        ts, container_id,
        reading["temperature"],
        reading["power_consumption"], reading["door_status"],
        reading["compressor_status"], reading["vibration_level"],
        reading["supply_voltage"],
    ))
    cur.close()


# ─── MQTT helpers ─────────────────────────────────────────────────────────────

def get_mqtt_client() -> mqtt.Client:
    client = mqtt.Client(client_id=f"reefer-simulator-{os.getpid()}")

    def on_connect(c, ud, flags, rc):
        logger.info(f"MQTT connected (rc={rc})")

    def on_disconnect(c, ud, rc):
        logger.warning(f"MQTT disconnected (rc={rc}), will reconnect...")

    client.on_connect = on_connect
    client.on_disconnect = on_disconnect

    retries = 0
    while retries < 10:
        try:
            client.connect(MQTT_HOST, MQTT_PORT, keepalive=60)
            client.loop_start()
            time.sleep(1)
            return client
        except Exception as e:
            retries += 1
            logger.warning(f"MQTT connect attempt {retries}/10 failed: {e}")
            time.sleep(5)

    raise RuntimeError("Could not connect to MQTT broker after 10 attempts")


def publish_reading(client: mqtt.Client, container_number: str, reading: dict):
    topic = f"reefer/sensor/{container_number}/all"
    payload = json.dumps({k: v for k, v in reading.items() if k not in ("fault_label", "scenario")})
    client.publish(topic, payload, qos=0, retain=False)

    # Also publish fault alert if in fault scenario
    if reading["fault_label"] >= 2:
        alert_payload = json.dumps({
            "container_number": container_number,
            "scenario": reading["scenario"],
            "severity": "CRITICAL" if reading["fault_label"] == 3 else "WARNING",
        })
        client.publish(f"reefer/alerts/{container_number}", alert_payload, qos=1)


# ─── Historical Seeding ───────────────────────────────────────────────────────

def seed_history(states: list[ContainerState], conn):
    """Populate last N days of history at 1-minute intervals."""
    days = CONFIG.get("history_days", 7)
    interval_minutes = 1
    start = datetime.now(timezone.utc) - timedelta(days=days)
    total_steps = days * 24 * 60 // interval_minutes

    logger.info(f"📚 Seeding {days} days of history ({total_steps} time steps × {len(states)} containers)...")

    fault_prob = CONFIG["fault_probability"] / 2  # Lower prob for history

    batch_size = 500
    cur = conn.cursor()
    rows = []

    for step in range(total_steps):
        ts = start + timedelta(minutes=step * interval_minutes)
        for state in states:
            # Inject faults occasionally
            if step % 30 == 0:
                state.maybe_inject_fault(fault_prob)
            reading = state.step()
            rows.append((
                ts, state.meta["id"],
                reading["temperature"],
                reading["power_consumption"], reading["door_status"],
                reading["compressor_status"], reading["vibration_level"],
                reading["supply_voltage"],
            ))

        if len(rows) >= batch_size:
            psycopg2.extras.execute_values(cur, """
                INSERT INTO sensor_readings (
                    time, container_id, temperature,
                    power_consumption, door_status, compressor_status,
                    vibration_level, supply_voltage
                ) VALUES %s ON CONFLICT DO NOTHING
            """, rows)
            conn.commit()
            rows = []

        if step % 1440 == 0:
            day_num = step // 1440
            logger.info(f"  📅 Day {day_num + 1}/{days} seeded...")

    if rows:
        psycopg2.extras.execute_values(cur, """
            INSERT INTO sensor_readings (
                time, container_id, temperature,
                power_consumption, door_status, compressor_status,
                vibration_level, supply_voltage
            ) VALUES %s ON CONFLICT DO NOTHING
        """, rows)
        conn.commit()

    cur.close()
    logger.info("✅ Historical seeding complete!")


# ─── Real-time Simulation ─────────────────────────────────────────────────────

def run_realtime(states: list[ContainerState], conn):
    """Publish sensor data every 30 seconds."""
    logger.info("🔄 Starting real-time simulation...")
    mqtt_client = get_mqtt_client()
    interval = CONFIG.get("interval_seconds", 30)
    fault_prob = CONFIG["fault_probability"]

    while True:
        batch_start = time.time()
        cur = conn.cursor()
        rows = []
        ts = datetime.now(timezone.utc)

        for state in states:
            state.maybe_inject_fault(fault_prob)
            reading = state.step()
            publish_reading(mqtt_client, state.meta["container_number"], reading)

            rows.append((
                ts, state.meta["id"],
                reading["temperature"],
                reading["power_consumption"], reading["door_status"],
                reading["compressor_status"], reading["vibration_level"],
                reading["supply_voltage"],
            ))

        psycopg2.extras.execute_values(cur, """
            INSERT INTO sensor_readings (
                time, container_id, temperature,
                power_consumption, door_status, compressor_status,
                vibration_level, supply_voltage
            ) VALUES %s
        """, rows)
        conn.commit()
        cur.close()

        elapsed = time.time() - batch_start
        sleep_time = max(0, interval - elapsed)
        logger.debug(f"⏱ Cycle done in {elapsed:.2f}s, sleeping {sleep_time:.1f}s")
        time.sleep(sleep_time)


# ─── Inject Fault CLI ─────────────────────────────────────────────────────────

def inject_fault_cli(container_number: str, scenario: str, conn):
    """Inject a specific fault for demo purposes."""
    cur = conn.cursor()
    cur.execute("SELECT id FROM containers WHERE container_number = %s", (container_number,))
    row = cur.fetchone()
    cur.close()
    if not row:
        logger.error(f"Container {container_number} not found")
        return

    logger.info(f"💉 Injecting fault: {scenario} on {container_number}")
    mqtt_client = get_mqtt_client()

    # Publish a simulated fault reading
    fault_reading = {
        "temperature": 15.0 if scenario != "complete_failure" else 20.0,
        "humidity": 85.0,
        "power_consumption": 6.5,
        "door_status": False,
        "compressor_status": scenario not in ("compressor_fault", "complete_failure"),
        "vibration_level": 5.0 if scenario == "compressor_degradation" else 1.0,
        "supply_voltage": 180.0 if scenario == "power_fluctuation" else 230.0,
    }
    publish_reading(mqtt_client, container_number, fault_reading)
    logger.info(f"✅ Fault reading published for {container_number}")


# ─── Entry Point ─────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="STAM Reefer Simulator")
    parser.add_argument("--seed-history", action="store_true", help="Seed historical data")
    parser.add_argument("--then-realtime", action="store_true", help="After seeding, run real-time")
    parser.add_argument("--realtime-only", action="store_true", help="Skip history, run real-time only")
    parser.add_argument("--inject-fault", nargs=2, metavar=("CONTAINER", "SCENARIO"),
                        help="Inject a specific fault")
    args = parser.parse_args()

    # Connect to DB with retries
    conn = None
    for attempt in range(15):
        try:
            conn = get_db_connection()
            logger.info("✅ Database connected")
            break
        except Exception as e:
            logger.warning(f"DB connection attempt {attempt + 1}/15: {e}")
            time.sleep(5)
    if not conn:
        logger.error("❌ Could not connect to database")
        sys.exit(1)

    if args.inject_fault:
        inject_fault_cli(args.inject_fault[0], args.inject_fault[1], conn)
        return

    if args.realtime_only:
        # Load existing containers from DB — no new seeding
        containers = load_containers_from_db(conn)
    else:
        # Fresh start: generate and seed containers + optional history
        containers = generate_containers(CONFIG["num_containers"])
        seed_containers(containers, conn)

    states = [ContainerState(c) for c in containers]

    if args.seed_history and not args.realtime_only:
        seed_history(states, conn)

    if args.then_realtime or args.realtime_only or (not args.seed_history):
        run_realtime(states, conn)


if __name__ == "__main__":
    main()
