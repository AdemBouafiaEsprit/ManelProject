// Container
export interface Container {
  id: string;
  container_number: string;
  owner?: string;
  commodity: string;
  target_temp: number;
  tolerance: number;
  arrival_date?: string;
  departure_date?: string;
  status: 'active' | 'critical' | 'departed' | 'maintenance' | 'offline';
  block?: string;
  row_num?: number;
  bay?: number;
  tier?: number;
  slot_lat?: number;
  slot_lng?: number;
  ecp_id?: string;
  created_at: string;
  latest_reading?: SensorReading;
  latest_risk?: RiskScore;
  active_alerts_count?: number;
}

// Sensor Reading
export interface SensorReading {
  time: string;
  container_id: string;
  temperature?: number;
  power_consumption?: number;
  door_status?: boolean;
  compressor_status?: boolean;
  vibration_level?: number;
  supply_voltage?: number;
}

// Risk Score
export interface RiskScore {
  id: string;
  container_id: string;
  scored_at: string;
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  risk_score?: number;
  predicted_failure_in_hours?: number;
  forecast_temperatures?: number[];
  anomaly_score?: number;
  top_factors?: { factor: string; value: number }[];
  model_version?: string;
}

// Alert
export interface Alert {
  id: string;
  container_id: string;
  alert_type: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  message: string;
  recommended_action?: string;
  triggered_at: string;
  acknowledged_at?: string;
  acknowledged_by?: string;
  resolved_at?: string;
  resolution_notes?: string;
  is_active: boolean;
  container_number?: string;
}

// Container timeline event
export interface ContainerEvent {
  kind: 'event' | 'alert';
  event_type: string;
  description: string;
  username?: string;
  happened_at: string;
}

// Auth
export interface User {
  id: string;
  username: string;
  email: string;
  role: 'operator' | 'supervisor' | 'admin';
  is_active: boolean;
  created_at: string;
}

export interface AuthToken {
  access_token: string;
  token_type: string;
  user: User;
}

// Live sensor data (for map)
export interface LiveReading {
  container_id: string;
  container_number: string;
  commodity: string;
  status: string;
  slot_lat?: number;
  slot_lng?: number;
  block?: string;
  row_num?: number;
  bay?: number;
  target_temp: number;
  temperature?: number;
  power_consumption?: number;
  door_status?: boolean;
  compressor_status?: boolean;
  time: string;
}

// WebSocket message
export interface WSMessage {
  type: 'sensor_update' | 'new_alert' | 'risk_update';
  container_id: string;
  container_number: string;
  data: any;
}

// Analytics
export interface KPISummary {
  total_active_containers: number;
  critical_alerts: number;
  warning_alerts: number;
  avg_risk_score: number;
  losses_prevented_usd: number;
  offline_containers: number;
}

// Map container feature
export interface MapContainerFeature {
  container_id: string;
  container_number: string;
  commodity: string;
  status: string;
  block?: string;
  row_num?: number;
  bay?: number;
  tier?: number;
  ecp_id?: string;
  target_temp?: number;
  risk_level: string;
  risk_score: number;
  color: string;
  failure_hours?: number;
}
