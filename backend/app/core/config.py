from enum import StrEnum
from functools import lru_cache
from typing import Annotated, Self

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Environment(StrEnum):
    DEVELOPMENT = "development"
    TEST = "test"
    PRODUCTION = "production"


class Settings(BaseSettings):
    """Application configuration, loaded from environment variables (and `.env`)."""

    # Repo-root .env when run from backend/, or a local one; real env vars take precedence.
    model_config = SettingsConfigDict(env_file=("../.env", ".env"), extra="ignore")

    environment: Environment = Environment.DEVELOPMENT
    log_level: str = "INFO"

    # Database
    database_url: str = "postgresql+asyncpg://danang:danang@localhost:5432/danang"

    # HTTP
    cors_origins: Annotated[list[str], NoDecode] = Field(default_factory=list)
    public_app_url: str = "http://localhost:5173"

    # Auth
    session_secret: SecretStr = SecretStr("")
    session_ttl_minutes: int = 60 * 24
    telegram_init_data_max_age_seconds: int = 60 * 60 * 24
    dev_auth_enabled: bool = False
    admin_telegram_user_ids: Annotated[frozenset[int], NoDecode] = frozenset()
    rate_limit_auth: str = "20/minute"
    rate_limit_admin_write: str = "120/minute"

    # Listings must be placed inside this box: "min_lng,min_lat,max_lng,max_lat".
    # Default covers Da Nang city incl. Hoa Vang.
    service_area_bbox: Annotated[tuple[float, float, float, float], NoDecode] = (
        107.80,
        15.85,
        108.40,
        16.25,
    )

    # Telegram
    telegram_bot_token: SecretStr = SecretStr("")
    telegram_bot_username: str = ""
    telegram_mini_app_short_name: str = ""
    telegram_channel_id: str = ""
    telegram_post_language: str = "en"
    admin_contact_telegram: str = ""

    # S3-compatible object storage
    s3_endpoint_url: str | None = None
    s3_public_base_url: str | None = None
    s3_region: str = "us-east-1"
    s3_bucket: str = "danang-apartments"
    s3_access_key_id: SecretStr = SecretStr("")
    s3_secret_access_key: SecretStr = SecretStr("")
    s3_auto_create_bucket: bool = False

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @field_validator("admin_telegram_user_ids", mode="before")
    @classmethod
    def _split_admin_ids(cls, value: object) -> object:
        if isinstance(value, str):
            return frozenset(int(part) for part in value.split(",") if part.strip())
        return value

    @field_validator("service_area_bbox", mode="before")
    @classmethod
    def _split_bbox(cls, value: object) -> object:
        if isinstance(value, str):
            parts = tuple(float(part) for part in value.split(","))
            if len(parts) != 4 or parts[0] >= parts[2] or parts[1] >= parts[3]:
                raise ValueError("SERVICE_AREA_BBOX must be min_lng,min_lat,max_lng,max_lat")
            return parts
        return value

    @model_validator(mode="after")
    def _check_production_safety(self) -> Self:
        if self.environment is Environment.PRODUCTION:
            if self.dev_auth_enabled:
                raise ValueError("DEV_AUTH_ENABLED must be false in production")
            if len(self.session_secret.get_secret_value()) < 32:
                raise ValueError("SESSION_SECRET must be at least 32 characters in production")
            if not self.telegram_bot_token.get_secret_value():
                raise ValueError("TELEGRAM_BOT_TOKEN is required in production")
            if self.s3_auto_create_bucket:
                raise ValueError("S3_AUTO_CREATE_BUCKET must be false in production")
        return self

    @property
    def is_production(self) -> bool:
        return self.environment is Environment.PRODUCTION


@lru_cache
def get_settings() -> Settings:
    return Settings()
