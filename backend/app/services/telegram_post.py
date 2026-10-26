"""Channel post text for a listing (Telegram HTML parse mode)."""

import html
import re
from dataclasses import dataclass
from decimal import Decimal

from app.core.config import Settings
from app.core.media import listing_share_url
from app.models import Apartment
from app.models.enums import Language

# Bot API limits, counted in UTF-16 code units of the visible text.
CAPTION_LIMIT = 1024
MESSAGE_LIMIT = 4096
MAX_MEDIA_GROUP = 10

_TEMPLATES: dict[Language, dict[str, str]] = {
    Language.EN: {
        "rent": "💰 Rent: {price} VND/month",
        "district": "📍 District: {district}",
        "area": "📐 Area: {area} m²",
        "bedrooms": "🛏 Bedrooms: {bedrooms}",
        "studio": "Studio",
        "bathrooms": "🛁 Bathrooms: {bathrooms}",
        "deposit": "Deposit: {deposit} VND",
        "minimum": "Minimum rental: {months} months",
        "minimum_one": "Minimum rental: 1 month",
        "link": "📲 View details and location",
    },
    Language.RU: {
        "rent": "💰 Аренда: {price} VND/мес.",
        "district": "📍 Район: {district}",
        "area": "📐 Площадь: {area} м²",
        "bedrooms": "🛏 Спальни: {bedrooms}",
        "studio": "студия",
        "bathrooms": "🛁 Санузлы: {bathrooms}",
        "deposit": "Депозит: {deposit} VND",
        "minimum": "Минимальный срок: {months} мес.",
        "minimum_one": "Минимальный срок: 1 мес.",
        "link": "📲 Подробнее и расположение",
    },
    Language.VI: {
        "rent": "💰 Giá thuê: {price} VND/tháng",
        "district": "📍 Quận: {district}",
        "area": "📐 Diện tích: {area} m²",
        "bedrooms": "🛏 Phòng ngủ: {bedrooms}",
        "studio": "Studio",
        "bathrooms": "🛁 Phòng tắm: {bathrooms}",
        "deposit": "Đặt cọc: {deposit} VND",
        "minimum": "Thời gian thuê tối thiểu: {months} tháng",
        "minimum_one": "Thời gian thuê tối thiểu: 1 tháng",
        "link": "📲 Xem chi tiết và vị trí",
    },
}

_TAG_RE = re.compile(r"<[^>]+>")


def visible_length(markup: str) -> int:
    """Length Telegram applies its limits to: entity-free text in UTF-16 code units."""
    return _utf16_length(html.unescape(_TAG_RE.sub("", markup)))


def _money(value: int, language: Language) -> str:
    grouped = f"{value:,}"
    separators = {Language.RU: " ", Language.VI: "."}
    return grouped.replace(",", separators.get(language, ","))


def _area(value: Decimal) -> str:
    return f"{value.normalize():f}"


def _esc(text: str) -> str:
    return html.escape(text, quote=False)


def _utf16_length(text: str) -> int:
    return len(text.encode("utf-16-le")) // 2


def _truncate(text: str, budget: int) -> str:
    """Cut plain `text` to at most `budget` UTF-16 units at a word boundary, adding "…"."""
    if _utf16_length(text) <= budget:
        return text
    low, high = 0, len(text)
    while low < high:  # longest prefix that fits together with the ellipsis
        middle = (low + high + 1) // 2
        if _utf16_length(text[:middle]) <= budget - 1:
            low = middle
        else:
            high = middle - 1
    cut = text[:low]
    space = cut.rfind(" ")
    if space > max(0, low - 40):
        cut = cut[:space]
    return cut.rstrip(" ,.;:\n") + "…"


@dataclass(frozen=True, slots=True)
class TelegramPost:
    html: str
    length: int
    limit: int


def build_post(
    settings: Settings, apartment: Apartment, *, with_media: bool, language: Language | None = None
) -> TelegramPost:
    """Requires a complete listing with `district` loaded."""
    lang = language or settings.telegram_post_language
    t = _TEMPLATES[lang]
    if apartment.district is None or apartment.price_vnd is None or apartment.bedrooms is None:
        raise ValueError("Listing is not complete enough to post")
    district = apartment.district.name_ru if lang is Language.RU else apartment.district.name_en

    facts = [
        t["rent"].format(price=_money(apartment.price_vnd, lang)),
        t["district"].format(district=_esc(district)),
    ]
    if apartment.area_sqm is not None:
        facts.append(t["area"].format(area=_area(apartment.area_sqm)))
    bedrooms = t["studio"] if apartment.bedrooms == 0 else str(apartment.bedrooms)
    facts.append(t["bedrooms"].format(bedrooms=bedrooms))
    if apartment.bathrooms is not None:
        facts.append(t["bathrooms"].format(bathrooms=apartment.bathrooms))

    terms = []
    if apartment.deposit_vnd is not None:
        terms.append(t["deposit"].format(deposit=_money(apartment.deposit_vnd, lang)))
    if apartment.minimum_rental_months is not None:
        months = apartment.minimum_rental_months
        terms.append(t["minimum_one"] if months == 1 else t["minimum"].format(months=months))

    link = html.escape(listing_share_url(settings, str(apartment.id)), quote=True)
    head = f"🏠 <b>{_esc(apartment.title or '')}</b>"
    tail = f'📲 <a href="{link}">{t["link"].removeprefix("📲 ")}</a>'

    def assemble(description: str | None) -> str:
        blocks = [head, "\n".join(facts)]
        if description:
            blocks.append(_esc(description))
        if terms:
            blocks.append("\n".join(terms))
        blocks.append(tail)
        return "\n\n".join(blocks)

    limit = CAPTION_LIMIT if with_media else MESSAGE_LIMIT
    description = (apartment.description or "").strip() or None
    if description:
        budget = limit - visible_length(assemble(None)) - 2  # the "\n\n" separator
        description = _truncate(description, budget) if budget > 20 else None
    markup = assemble(description)
    return TelegramPost(html=markup, length=visible_length(markup), limit=limit)


def post_url(channel_id: str, message_id: int | None) -> str | None:
    """Public link to a channel message (t.me/c/… links work for channel members)."""
    if message_id is None:
        return None
    if channel_id.startswith("@"):
        return f"https://t.me/{channel_id[1:]}/{message_id}"
    if channel_id.startswith("-100") and channel_id[4:].isdigit():
        return f"https://t.me/c/{channel_id[4:]}/{message_id}"
    return None
