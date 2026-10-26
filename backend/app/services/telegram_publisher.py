"""Sending a prepared post to the channel via the Bot API (aiogram), and classifying errors
into "Telegram definitely rejected it" (safe to retry) vs "outcome unknown" (never retried
automatically, because a retry could duplicate the post)."""

import io
from dataclasses import dataclass
from functools import lru_cache
from typing import Protocol

from aiogram import Bot
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.exceptions import (
    TelegramAPIError,
    TelegramBadRequest,
    TelegramForbiddenError,
    TelegramNetworkError,
    TelegramRetryAfter,
    TelegramServerError,
    TelegramUnauthorizedError,
)
from aiogram.types import (
    BufferedInputFile,
    InputMediaAudio,
    InputMediaDocument,
    InputMediaLivePhoto,
    InputMediaPhoto,
    InputMediaVideo,
)
from PIL import Image

from app.core.config import Settings, get_settings
from app.models.enums import PublicationStatus

MediaItem = (
    InputMediaAudio | InputMediaDocument | InputMediaLivePhoto | InputMediaPhoto | InputMediaVideo
)


class ChannelPublisher(Protocol):
    async def publish(self, channel_id: str, caption_html: str, photos: list[bytes]) -> int:
        """Send the post; return the id of the (first) channel message."""
        ...

    async def close(self) -> None: ...


def to_jpeg(webp: bytes) -> bytes:
    """Telegram photos are most reliable as JPEG; our stored variants are WebP."""
    with Image.open(io.BytesIO(webp)) as image:
        buffer = io.BytesIO()
        image.convert("RGB").save(buffer, format="JPEG", quality=88)
    return buffer.getvalue()


class AiogramPublisher:
    def __init__(self, token: str, request_timeout: int) -> None:
        self._bot = Bot(token=token, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
        self._timeout = request_timeout

    async def publish(self, channel_id: str, caption_html: str, photos: list[bytes]) -> int:
        files = [
            BufferedInputFile(data, filename=f"photo-{index + 1}.jpg")
            for index, data in enumerate(photos)
        ]
        if not files:
            message = await self._bot.send_message(
                chat_id=channel_id, text=caption_html, request_timeout=self._timeout
            )
            return message.message_id
        if len(files) == 1:
            message = await self._bot.send_photo(
                chat_id=channel_id,
                photo=files[0],
                caption=caption_html,
                request_timeout=self._timeout,
            )
            return message.message_id
        media: list[MediaItem] = [
            InputMediaPhoto(media=file, caption=caption_html if index == 0 else None)
            for index, file in enumerate(files)
        ]
        messages = await self._bot.send_media_group(
            chat_id=channel_id, media=media, request_timeout=self._timeout
        )
        return messages[0].message_id

    async def close(self) -> None:
        await self._bot.session.close()


@lru_cache
def _publisher(token: str, timeout: int) -> AiogramPublisher:
    return AiogramPublisher(token, timeout)


def get_publisher() -> ChannelPublisher:
    """FastAPI dependency; tests override it with a fake."""
    settings = get_settings()
    return _publisher(
        settings.telegram_bot_token.get_secret_value(), settings.telegram_request_timeout_seconds
    )


async def close_publishers() -> None:
    if _publisher.cache_info().currsize:
        settings = get_settings()
        await _publisher(
            settings.telegram_bot_token.get_secret_value(),
            settings.telegram_request_timeout_seconds,
        ).close()
        _publisher.cache_clear()


@dataclass(frozen=True, slots=True)
class Failure:
    status: PublicationStatus
    code: str
    message: str


_BAD_REQUEST_CODES = (
    ("chat not found", "chat_not_found"),
    ("need administrator rights", "bot_not_admin"),
    ("not enough rights", "missing_permission"),
    ("caption is too long", "caption_too_long"),
    ("message is too long", "caption_too_long"),
    ("photo", "media_rejected"),
    ("image", "media_rejected"),
    ("file", "media_rejected"),
    ("media", "media_rejected"),
)


def classify_error(error: Exception, settings: Settings | None = None) -> Failure:
    """Map an exception from a publish attempt to a stored outcome."""
    failed, unknown = PublicationStatus.FAILED, PublicationStatus.UNKNOWN
    text = str(error)
    if isinstance(error, TelegramRetryAfter):
        return Failure(failed, "rate_limited", f"Retry after {error.retry_after} s")
    if isinstance(error, TelegramUnauthorizedError):
        return Failure(failed, "bot_token_invalid", text)
    if isinstance(error, TelegramForbiddenError):
        return Failure(failed, "bot_not_admin", text)
    if isinstance(error, TelegramBadRequest):
        lowered = text.lower()
        code = next(
            (c for needle, c in _BAD_REQUEST_CODES if needle in lowered), "telegram_rejected"
        )
        return Failure(failed, code, text)
    if isinstance(error, TelegramNetworkError):
        # A failed connection never reached Telegram; anything else (timeouts, dropped
        # connections) may have been delivered.
        if "ClientConnectorError" in text or "Cannot connect" in text:
            return Failure(failed, "telegram_unavailable", text)
        return Failure(unknown, "unconfirmed", text)
    if isinstance(error, TelegramServerError):
        return Failure(unknown, "unconfirmed", text)
    if isinstance(error, TelegramAPIError):
        return Failure(failed, "telegram_rejected", text)
    return Failure(unknown, "unconfirmed", f"{type(error).__name__}: {text}")
