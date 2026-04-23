-- =============================================================
-- STAM Reefer Platform — PostgreSQL + TimescaleDB Init Script
-- =============================================================

-- Enable TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================
-- USERS
-- =============================================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  hashed_password TEXT NOT NULL,
  role VARCHAR(20) DEFAULT 'operator' CHECK (role IN ('operator', 'supervisor', 'admin')),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================
-- CONTAINERS
-- =============================================================
CREATE TABLE IF NOT EXISTS containers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  container_number VARCHAR(20) UNIQUE NOT NULL,
  owner VARCHAR(100),
  commodity VARCHAR(100) NOT NULL,
  target_temp FLOAT NOT NULL,
  tolerance FLOAT DEFAULT 2.0,
  arrival_date TIMESTAMPTZ,
  departure_date TIMESTAMPTZ,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'departed', 'maintenance', 'critical', 'offline')),
  block VARCHAR(10),
  row_num INT,
  bay INT,
  tier INT,
  slot_lat FLOAT,
  slot_lng FLOAT,
  ecp_id VARCHAR(20),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================
-- SENSOR READINGS — TimescaleDB Hypertable
-- =============================================================
CREATE TABLE IF NOT EXISTS sensor_readings (
  time TIMESTAMPTZ NOT NULL,
  container_id UUID REFERENCES containers(id) ON DELETE CASCADE,
  temperature FLOAT,
  power_consumption FLOAT,
  door_status BOOLEAN DEFAULT FALSE,
  compressor_status BOOLEAN DEFAULT TRUE,
  vibration_level FLOAT,
  supply_voltage FLOAT
);

-- Convert to TimescaleDB hypertable (partition by time, 1 day chunks)
SELECT create_hypertable('sensor_readings', 'time', chunk_time_interval => INTERVAL '1 day', if_not_exists => TRUE);

-- Index for fast container queries
CREATE INDEX IF NOT EXISTS idx_sensor_readings_container_time 
  ON sensor_readings (container_id, time DESC);

-- =============================================================
-- RISK SCORES (ML Predictions)
-- =============================================================
CREATE TABLE IF NOT EXISTS risk_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  container_id UUID REFERENCES containers(id) ON DELETE CASCADE,
  scored_at TIMESTAMPTZ DEFAULT NOW(),
  risk_level VARCHAR(10) NOT NULL CHECK (risk_level IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  risk_score FLOAT CHECK (risk_score >= 0 AND risk_score <= 1),
  predicted_failure_in_hours FLOAT,
  forecast_temperatures JSONB,
  anomaly_score FLOAT,
  top_factors JSONB,
  model_version VARCHAR(20) DEFAULT 'v1.0'
);

CREATE INDEX IF NOT EXISTS idx_risk_scores_container_time 
  ON risk_scores (container_id, scored_at DESC);

-- =============================================================
-- ALERTS
-- =============================================================
CREATE TABLE IF NOT EXISTS alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  container_id UUID REFERENCES containers(id) ON DELETE CASCADE,
  alert_type VARCHAR(50) NOT NULL CHECK (alert_type IN (
    'TEMP_EXCURSION', 'POWER_FAILURE', 'COMPRESSOR_FAULT',
    'HIGH_RISK_PREDICTED', 'DOOR_OPEN',
    'VOLTAGE_DROP', 'COMPLETE_FAILURE', 'VIBRATION_ANOMALY',
    'SHOCK_DETECTED'
  )),
  severity VARCHAR(10) NOT NULL CHECK (severity IN ('INFO', 'WARNING', 'CRITICAL')),
  message TEXT NOT NULL,
  recommended_action TEXT,
  triggered_at TIMESTAMPTZ DEFAULT NOW(),
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID REFERENCES users(id),
  resolved_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_alerts_container_active 
  ON alerts (container_id, is_active, triggered_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_active_severity 
  ON alerts (is_active, severity, triggered_at DESC);

-- =============================================================
-- CONTINUOUS AGGREGATE — Hourly Stats (TimescaleDB)
-- =============================================================
CREATE MATERIALIZED VIEW IF NOT EXISTS hourly_sensor_stats
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
GROUP BY bucket, container_id;

-- Refresh policy: update every 10 minutes, lag 1 hour
SELECT add_continuous_aggregate_policy('hourly_sensor_stats',
  start_offset => INTERVAL '3 days',
  end_offset => INTERVAL '1 hour',
  schedule_interval => INTERVAL '10 minutes',
  if_not_exists => TRUE
);

-- =============================================================
-- SEED DEFAULT ADMIN USER (password: admin123)
-- bcrypt hash of 'admin123'
-- =============================================================
INSERT INTO users (username, email, hashed_password, role) VALUES
  ('admin', 'admin@stam.tn', '$2b$12$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW', 'admin'),
  ('supervisor', 'supervisor@stam.tn', '$2b$12$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW', 'supervisor'),
  ('operator', 'operator@stam.tn', '$2b$12$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW', 'operator')
ON CONFLICT (username) DO NOTHING;
