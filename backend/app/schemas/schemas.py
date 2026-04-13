from datetime import datetime
from typing import Optional, List, Any
from uuid import UUID
from pydantic import BaseModel, EmailStr


# ── Auth ────────────────────────────────────────────────────────
class LoginRequest(BaseModel):
    username: str
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserOut"


class UserOut(BaseModel):
    id: UUID
    username: str
    email: str
    role: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class UserCreate(BaseModel):
    username: str
    email: EmailStr
    password: str
    role: str = "operator"


# ── Container ────────────────────────────────────────────────────
class ContainerOut(BaseModel):
    id: UUID
    container_number: str
    owner: Optional[str]
    commodity: str
    target_temp: float
    target_humidity: Optional[float]
    tolerance: float
    arrival_date: Optional[datetime]
    departure_date: Optional[datetime]
    status: str
    block: Optional[str]
    row_num: Optional[int]
    bay: Optional[int]
    tier: Optional[int]
    slot_lat: Optional[float]
    slot_lng: Optional[float]
    ecp_id: Optional[str]
    created_at: datetime
    # Joined fields
    latest_reading: Optional["SensorReadingOut"] = None
    latest_risk: Optional["RiskScoreOut"] = None
    active_alerts_count: Optional[int] = 0

    model_config = {"from_attributes": True}


class ContainerUpdate(BaseModel):
    status: Optional[str] = None
    block: Optional[str] = None
    row_num: Optional[int] = None
    bay: Optional[int] = None


class ContainerCreate(BaseModel):
    container_number: str
    owner: Optional[str] = None
    commodity: str
    target_temp: float
    target_humidity: Optional[float] = None
    tolerance: float = 2.0
    arrival_date: Optional[datetime] = None
    departure_date: Optional[datetime] = None
    block: Optional[str] = None
    row_num: Optional[int] = None
    bay: Optional[int] = None
    tier: Optional[int] = None
    slot_lat: Optional[float] = None
    slot_lng: Optional[float] = None
    ecp_id: Optional[str] = None


# ── Sensor ────────────────────────────────────────────────────────
class SensorReadingOut(BaseModel):
    time: datetime
    container_id: UUID
    temperature: Optional[float]
    humidity: Optional[float]
    power_consumption: Optional[float]
    door_status: Optional[bool]
    compressor_status: Optional[bool]
    vibration_level: Optional[float]
    supply_voltage: Optional[float]

    model_config = {"from_attributes": True}


class SensorReadingCreate(BaseModel):
    container_id: UUID
    temperature: Optional[float]
    humidity: Optional[float]
    power_consumption: Optional[float]
    door_status: bool = False
    compressor_status: bool = True
    vibration_level: Optional[float]
    supply_voltage: Optional[float]


# ── Risk Score ────────────────────────────────────────────────────
class RiskScoreOut(BaseModel):
    id: UUID
    container_id: UUID
    scored_at: datetime
    risk_level: str
    risk_score: Optional[float]
    predicted_failure_in_hours: Optional[float]
    forecast_temperatures: Optional[List[float]]
    anomaly_score: Optional[float]
    top_factors: Optional[List[dict]]
    model_version: Optional[str]

    model_config = {"from_attributes": True}


# ── Alert ─────────────────────────────────────────────────────────
class AlertOut(BaseModel):
    id: UUID
    container_id: UUID
    alert_type: str
    severity: str
    message: str
    recommended_action: Optional[str]
    triggered_at: datetime
    acknowledged_at: Optional[datetime]
    acknowledged_by: Optional[UUID]
    resolved_at: Optional[datetime]
    is_active: bool
    container_number: Optional[str] = None

    model_config = {"from_attributes": True}


class BlockCreate(BaseModel):
    block_id: str
    name: str
    rows: int = 10
    bays: int = 20
    tiers: int = 4
    color: Optional[str] = None
    stroke: Optional[str] = None
    lat_min: float
    lat_max: float
    lng_min: float
    lng_max: float


class BlockOut(BaseModel):
    id: UUID
    block_id: str
    name: str
    rows: int
    bays: int
    tiers: int
    color: str
    stroke: str
    lat_min: float
    lat_max: float
    lng_min: float
    lng_max: float

    model_config = {"from_attributes": True}


# ── Analytics ─────────────────────────────────────────────────────
class KPISummary(BaseModel):
    total_active_containers: int
    critical_alerts: int
    avg_risk_score: float
    losses_prevented_usd: float
    offline_containers: int


class ChartDataPoint(BaseModel):
    x: Any  # datetime or string category
    y: float


class SeriesData(BaseModel):
    name: str
    data: List[ChartDataPoint]


# ── WebSocket ─────────────────────────────────────────────────────
class WSMessage(BaseModel):
    type: str  # sensor_update | new_alert | risk_update
    container_id: str
    container_number: str
    data: dict
