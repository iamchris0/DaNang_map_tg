import uuid
from datetime import datetime

from pydantic import Field

from app.models.enums import PublicationStatus
from app.schemas.common import Schema


class PublicationOut(Schema):
    id: uuid.UUID
    status: PublicationStatus
    telegram_channel_id: str
    telegram_message_id: int | None
    post_url: str | None
    error_code: str | None
    error_message: str | None
    published_by: str | None
    created_at: datetime
    published_at: datetime | None


class TelegramPreviewOut(Schema):
    caption_html: str | None
    caption_length: int
    caption_limit: int
    photo_urls: list[str]
    channel_id: str
    language: str
    can_publish: bool
    # Reasons publishing is not possible right now (stable codes for the UI).
    blockers: list[str]
    live_publication: PublicationOut | None


class ResolvePublication(Schema):
    was_published: bool
    message_id: int | None = Field(default=None, gt=0)
