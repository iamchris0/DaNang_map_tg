from decimal import Decimal

import pytest
from aiogram.exceptions import (
    TelegramBadRequest,
    TelegramForbiddenError,
    TelegramNetworkError,
    TelegramRetryAfter,
    TelegramServerError,
    TelegramUnauthorizedError,
)
from aiogram.methods import SendMessage
from pydantic import SecretStr

from app.bot.handlers import start_reply
from app.core.amenities import AMENITIES, AMENITY_LABELS
from app.core.config import Settings
from app.models import Apartment, District
from app.models.enums import Language, PublicationStatus
from app.services.telegram_post import (
    CAPTION_LIMIT,
    MESSAGE_LIMIT,
    build_post,
    post_url,
    visible_length,
)
from app.services.telegram_publisher import classify_error

LISTING_ID = "11111111-1111-4111-8111-111111111111"


def _settings(**overrides: object) -> Settings:
    values: dict[str, object] = {
        "telegram_bot_username": "DaNangAptBot",
        "telegram_mini_app_short_name": "app",
        "telegram_bot_token": SecretStr("1:x"),
        **overrides,
    }
    return Settings(_env_file=None, **values)  # type: ignore[arg-type]


def _apartment(**overrides: object) -> Apartment:
    apartment = Apartment(
        id=LISTING_ID,
        title="1BR Apartment Near My Khe Beach",
        price_vnd=12_000_000,
        area_sqm=Decimal("45.0"),
        bedrooms=1,
        bathrooms=1,
        description="Fully furnished apartment near the beach.",
        deposit_vnd=12_000_000,
        minimum_rental_months=6,
    )
    apartment.district = District(id=2, slug="son-tra", name_en="Sơn Trà", name_ru="Шонча")
    for key, value in overrides.items():
        setattr(apartment, key, value)
    return apartment


def test_english_post_matches_the_spec_format() -> None:
    post = build_post(_settings(), _apartment(), with_media=True)
    assert post.html == (
        "🏠 <b>1BR Apartment Near My Khe Beach</b>\n\n"
        "💰 Rent: 12,000,000 VND/month\n"
        "📍 District: Sơn Trà\n"
        "📐 Area: 45 m²\n"
        "🛏 Bedrooms: 1\n"
        "🛁 Bathrooms: 1\n\n"
        "Fully furnished apartment near the beach.\n\n"
        "Deposit: 12,000,000 VND\n"
        "Minimum rental: 6 months\n\n"
        f'📲 <a href="https://t.me/DaNangAptBot/app?startapp={LISTING_ID}">'
        "View details and location</a>"
    )
    assert post.limit == CAPTION_LIMIT
    assert post.length == visible_length(post.html)


def test_vietnamese_post() -> None:
    post = build_post(_settings(telegram_post_language="vi"), _apartment(), with_media=True)
    assert "💰 Giá thuê: 12.000.000 VND/tháng" in post.html
    assert "📍 Quận: Sơn Trà" in post.html
    assert "Thời gian thuê tối thiểu: 6 tháng" in post.html
    assert post.html.endswith("Xem chi tiết và vị trí</a>")


def test_deposit_in_months() -> None:
    post = build_post(_settings(), _apartment(deposit_vnd=None, deposit_months=2), with_media=True)
    assert "Deposit: 2 months' rent" in post.html
    ru = build_post(
        _settings(telegram_post_language="ru"),
        _apartment(deposit_vnd=None, deposit_months=1),
        with_media=True,
    )
    assert "Депозит: 1 мес. аренды" in ru.html


def test_post_includes_address_amenities_and_conditions() -> None:
    post = build_post(
        _settings(),
        _apartment(
            address="12 An Thuong 2",
            amenities=["air_conditioning", "wifi", "pool"],
            custom_amenities=["Rooftop BBQ"],
            rental_conditions="No smoking. Pets on request.",
        ),
        with_media=True,
    )
    assert "🗺 Address: 12 An Thuong 2" in post.html
    assert "✨ Amenities: Air conditioning · Wi-Fi · Swimming pool · Rooftop BBQ" in post.html
    assert "📋 Rental conditions:\nNo smoking. Pets on request." in post.html
    # Order: facts, description, amenities, terms, conditions, link.
    assert (
        post.html.index("Fully furnished")
        < post.html.index("✨")
        < post.html.index("Deposit")
        < post.html.index("📋")
        < post.html.index("📲")
    )

    many = build_post(
        _settings(telegram_post_language="ru"),
        _apartment(amenities=list(AMENITIES)),
        with_media=True,
    )
    assert f"и ещё {len(AMENITIES) - 12}" in many.html


def test_long_description_and_conditions_both_fit() -> None:
    post = build_post(
        _settings(),
        _apartment(description="Sunny flat. " * 200, rental_conditions="Quiet hours. " * 200),
        with_media=True,
    )
    assert post.length <= CAPTION_LIMIT
    assert "Sunny flat." in post.html and "Quiet hours." in post.html
    assert post.html.count("…") == 2


def test_every_amenity_has_a_post_label_in_every_language() -> None:
    for language in Language:
        assert set(AMENITY_LABELS[language.value]) == set(AMENITIES)


def test_russian_post_and_optional_fields() -> None:
    post = build_post(
        _settings(telegram_post_language="ru"),
        _apartment(bedrooms=0, area_sqm=None, bathrooms=None, deposit_vnd=None),
        with_media=False,
    )
    assert "💰 Аренда: 12 000 000 VND/мес." in post.html
    assert "📍 Район: Шонча" in post.html
    assert "🛏 Спальни: студия" in post.html
    assert "Площадь" not in post.html and "Санузлы" not in post.html
    assert "Депозит" not in post.html
    assert "Минимальный срок: 6 мес." in post.html
    assert post.limit == MESSAGE_LIMIT


def test_singular_minimum_rental() -> None:
    post = build_post(_settings(), _apartment(minimum_rental_months=1), with_media=True)
    assert "Minimum rental: 1 month\n" in post.html


def test_user_text_is_html_escaped() -> None:
    post = build_post(
        _settings(),
        _apartment(title="<script>&", description="Use <b> tags & stuff"),
        with_media=True,
    )
    assert "<b>&lt;script&gt;&amp;</b>" in post.html
    assert "Use &lt;b&gt; tags &amp; stuff" in post.html


def test_long_description_is_truncated_to_the_caption_limit() -> None:
    long_text = "Spacious flat with a balcony and sea views. " * 80  # ~3500 chars
    post = build_post(_settings(), _apartment(description=long_text), with_media=True)
    assert post.length <= CAPTION_LIMIT
    assert "…" in post.html
    assert post.html.endswith("View details and location</a>")  # link always kept

    as_message = build_post(_settings(), _apartment(description=long_text), with_media=False)
    assert "…" not in as_message.html
    assert as_message.length <= MESSAGE_LIMIT


def test_emoji_count_as_two_units() -> None:
    assert visible_length("<b>a&amp;b</b> 😀") == 6


def test_web_fallback_link_without_mini_app() -> None:
    settings = _settings(telegram_mini_app_short_name="", public_app_url="https://app.example")
    post = build_post(settings, _apartment(), with_media=True)
    assert f'href="https://app.example/apartments/{LISTING_ID}"' in post.html


@pytest.mark.parametrize(
    ("channel", "message_id", "expected"),
    [
        ("@danang_rent", 42, "https://t.me/danang_rent/42"),
        ("-1001234567890", 42, "https://t.me/c/1234567890/42"),
        ("-12345", 42, None),
        ("@danang_rent", None, None),
    ],
)
def test_post_url(channel: str, message_id: int | None, expected: str | None) -> None:
    assert post_url(channel, message_id) == expected


METHOD = SendMessage(chat_id=1, text="x")
FAILED, UNKNOWN = PublicationStatus.FAILED, PublicationStatus.UNKNOWN


@pytest.mark.parametrize(
    ("error", "status", "code"),
    [
        (
            TelegramForbiddenError(METHOD, "Forbidden: bot is not a member of the channel chat"),
            FAILED,
            "bot_not_admin",
        ),
        (
            TelegramBadRequest(
                METHOD, "Bad Request: need administrator rights in the channel chat"
            ),
            FAILED,
            "bot_not_admin",
        ),
        (
            TelegramBadRequest(METHOD, "Bad Request: not enough rights to send photos to the chat"),
            FAILED,
            "missing_permission",
        ),
        (TelegramBadRequest(METHOD, "Bad Request: chat not found"), FAILED, "chat_not_found"),
        (TelegramBadRequest(METHOD, "Bad Request: IMAGE_PROCESS_FAILED"), FAILED, "media_rejected"),
        (
            TelegramBadRequest(METHOD, "Bad Request: message caption is too long"),
            FAILED,
            "caption_too_long",
        ),
        (TelegramBadRequest(METHOD, "Bad Request: something new"), FAILED, "telegram_rejected"),
        (TelegramRetryAfter(METHOD, "Too Many Requests", retry_after=30), FAILED, "rate_limited"),
        (TelegramUnauthorizedError(METHOD, "Unauthorized"), FAILED, "bot_token_invalid"),
        (
            TelegramNetworkError(METHOD, "ClientConnectorError: Cannot connect to host"),
            FAILED,
            "telegram_unavailable",
        ),
        (TelegramNetworkError(METHOD, "Request timeout error"), UNKNOWN, "unconfirmed"),
        (TelegramServerError(METHOD, "Internal Server Error"), UNKNOWN, "unconfirmed"),
        (RuntimeError("boom"), UNKNOWN, "unconfirmed"),
    ],
)
def test_error_classification(error: Exception, status: PublicationStatus, code: str) -> None:
    failure = classify_error(error)
    assert (failure.status, failure.code) == (status, code)


def test_bot_start_opens_the_mini_app() -> None:
    settings = _settings(public_app_url="https://app.example")
    text, keyboard = start_reply(settings, Language.RU, None)
    assert text.startswith("Долгосрочная аренда")
    assert keyboard is not None
    button = keyboard.inline_keyboard[0][0]
    assert button.text == "🏠 Открыть квартиры"
    assert button.web_app is not None and button.web_app.url == "https://app.example/"

    def opened_url(payload: str) -> str:
        _, markup = start_reply(settings, Language.EN, payload)
        assert markup is not None
        web_app = markup.inline_keyboard[0][0].web_app
        assert web_app is not None
        return web_app.url

    assert opened_url(LISTING_ID) == f"https://app.example/apartments/{LISTING_ID}"
    assert opened_url("not-a-listing") == "https://app.example/"  # unknown payloads ignored


def test_bot_needs_https_for_mini_app_buttons() -> None:
    text, keyboard = start_reply(
        _settings(public_app_url="http://localhost:5173"), Language.EN, None
    )
    assert keyboard is None
    assert "not available" in text


def test_language_setting_validated() -> None:
    assert _settings(telegram_post_language="ru").telegram_post_language is Language.RU
    with pytest.raises(ValueError):
        _settings(telegram_post_language="de")
