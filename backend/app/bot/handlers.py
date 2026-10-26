"""Bot conversation: /start opens the Mini App (optionally on a specific listing)."""

import re

from aiogram import Router
from aiogram.filters import CommandObject, CommandStart
from aiogram.types import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    Message,
    WebAppInfo,
)

from app.core.config import Settings
from app.models.enums import Language

UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)

TEXTS = {
    Language.EN: {
        "greeting": "Long-term apartments in Da Nang on a map: filter by price, bedrooms and "
        "district, see photos and contact the agent.",
        "open": "🏠 Open apartments",
        "open_listing": "🏠 Open this apartment",
        "menu": "Apartments",
        "no_https": "The app is not available yet. Please try again later.",
    },
    Language.RU: {
        "greeting": "Долгосрочная аренда квартир в Дананге на карте: фильтры по цене, "
        "спальням и району, фото и контакты агента.",
        "open": "🏠 Открыть квартиры",
        "open_listing": "🏠 Открыть квартиру",
        "menu": "Квартиры",
        "no_https": "Приложение пока недоступно. Попробуйте позже.",
    },
}


def language_for(code: str | None) -> Language:
    return Language.RU if (code or "").lower().startswith("ru") else Language.EN


def mini_app_url(settings: Settings, listing_id: str | None = None) -> str | None:
    """Telegram only opens Mini Apps over HTTPS."""
    base = settings.public_app_url.rstrip("/")
    if not base.startswith("https://"):
        return None
    return f"{base}/apartments/{listing_id}" if listing_id else f"{base}/"


def start_reply(
    settings: Settings, language_code: str | None, payload: str | None
) -> tuple[str, InlineKeyboardMarkup | None]:
    texts = TEXTS[language_for(language_code)]
    listing_id = payload if payload and UUID_RE.match(payload) else None
    url = mini_app_url(settings, listing_id)
    if url is None:
        return texts["no_https"], None
    label = texts["open_listing"] if listing_id else texts["open"]
    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[[InlineKeyboardButton(text=label, web_app=WebAppInfo(url=url))]]
    )
    return texts["greeting"], keyboard


def build_router(settings: Settings) -> Router:
    router = Router()

    @router.message(CommandStart())
    async def on_start(message: Message, command: CommandObject) -> None:
        language_code = message.from_user.language_code if message.from_user else None
        text, keyboard = start_reply(settings, language_code, command.args)
        await message.answer(text, reply_markup=keyboard)

    return router
