from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql://medisphere:medisphere@localhost:5434/medisphere"
    jwt_secret: str = "prototype-dev-secret"
    default_tenant_id: str = "demo-maldives"

    identity_service_url: str = "http://localhost:4001"
    tenant_config_service_url: str = "http://localhost:4002"
    patient_service_url: str = "http://localhost:4003"
    appointment_service_url: str = "http://localhost:4004"
    consultation_service_url: str = "http://localhost:4005"
    prescription_service_url: str = "http://localhost:4006"
    ai_triage_service_url: str = "http://localhost:4007"
    delivery_service_url: str = "http://localhost:4008"
    pharmacy_service_url: str = "http://localhost:4009"
    clinical_copilot_service_url: str = "http://localhost:4010"
    patient_bff_port: int = 4100
    doctor_bff_port: int = 4101
    pharmacy_bff_port: int = 4102


@lru_cache
def get_settings() -> Settings:
    return Settings()
