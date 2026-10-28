import uuid
from datetime import datetime
from typing import Literal

from pydantic import Field

from app.models.enums import Language, UserRole
from app.schemas.common import Schema


class TelegramAuthRequest(Schema):
    init_data: str = Field(min_length=1, max_length=8192)


class LinkAuthRequest(Schema):
    code: str = Field(min_length=16, max_length=128)


class DevAuthRequest(Schema):
    telegram_user_id: int = Field(gt=0)
    username: str | None = Field(default=None, max_length=64)
    display_name: str | None = Field(default=None, max_length=256)


class UserOut(Schema):
    id: uuid.UUID
    telegram_user_id: int
    username: str | None
    display_name: str | None
    preferred_language: Language | None
    is_admin: bool
    # "user" (tenant), "landlord" (manages own listings) or "admin" (manages all listings).
    role: UserRole


class AuthResponse(Schema):
    access_token: str
    token_type: Literal["bearer"] = "bearer"  # noqa: S105
    expires_at: datetime
    user: UserOut
    # Mini App launch parameter (e.g. a listing id from a shared deep link).
    start_param: str | None = None


class UserPreferencesUpdate(Schema):
    preferred_language: Language
