from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "postgresql+asyncpg://reefer_user:reefer_pass@localhost:5432/reefer_db"

    # Redis
    REDIS_URL: str = "redis://localhost:6379"

    # MQTT
    MQTT_BROKER_HOST: str = "localhost"
    MQTT_BROKER_PORT: int = 1883

    # JWT Auth
    SECRET_KEY: str = "stam-reefer-super-secret-jwt-key-2024"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480

    # App
    APP_NAME: str = "STAM Reefer Monitoring Platform"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True

    class Config:
        env_file = ".env"


settings = Settings()
