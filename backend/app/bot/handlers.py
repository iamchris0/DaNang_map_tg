"""Bot conversation.

- /start: the first time, a welcome with a role choice (tenant or landlord); afterwards a
  button that opens the Mini App (optionally on a specific listing from a deep link).
- Landlord: Telegram's contact button asks the user to share their phone number; sharing
  their own contact makes them a landlord, who manages their own listings in the Mini App.
- /role: shows the current role and offers to change it.

The conversation logic lives in `*_flow` functions that return the replies to send, so it
can be tested without Telegram.
"""

import re
from dataclasses import dataclass

from aiogram import F, Router
from aiogram.filters import Command, CommandObject, CommandStart
from aiogram.types import (
    CallbackQuery,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    KeyboardButton,
    Message,
    ReplyKeyboardMarkup,
    ReplyKeyboardRemove,
    WebAppInfo,
)
from aiogram.types import User as TelegramUser
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import Settings
from app.core.security import TelegramWebAppUser
from app.models import User
from app.models.enums import Language, UserRole
from app.services import users

UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)
ROLE_CALLBACK = "role"
TENANT, LANDLORD = "tenant", "landlord"

TEXTS = {
    Language.EN: {
        "greeting": "Long-term apartments in Da Nang on a map: filter by price, bedrooms and "
        "district, see photos and contact the agent.",
        "open": "🏠 Open apartments",
        "open_listing": "🏠 Open this apartment",
        "menu": "Apartments",
        "no_https": "The app is not available yet. Please try again later.",
        "welcome": "👋 Welcome to Da Nang Apartments!\n\nLong-term rentals in Da Nang on a map. "
        "Tell us who you are:",
        "choose_tenant": "🔍 I'm looking for a place",
        "choose_landlord": "🔑 I'm a landlord",
        "tenant_done": "Great! Browse apartments on the map, filter them and contact agents.",
        "share_request": "To list apartments, please share your contact. Tap the button "
        "below and Telegram will ask you to confirm.",
        "share_button": "📱 Share my contact",
        "cancel": "Cancel",
        "cancelled": "OK, your role has not changed.",
        "not_own_contact": "Please share your own contact using the button below.",
        "landlord_done": "✅ You are a landlord now.\n\nOpen the app and tap ⚙️ in the top right "
        "corner to add your apartments. You will see only your own listings.",
        "role_current": "Your role: {role}.",
        "role_tenant": "tenant",
        "role_landlord": "landlord",
        "role_admin": "administrator",
        "about_tenant": "You see every available apartment.",
        "about_landlord": "You manage your own listings and see only them in the app.",
        "about_admin": "You manage all listings. This is set in the server configuration.",
        "switch_to_landlord": "🔑 Become a landlord",
        "switch_to_tenant": "🔍 Switch to tenant",
        "tenant_switched": "You are a tenant now. Your listings stay as they are; "
        "switch back with /role to manage them.",
        "cmd_start": "Open the apartments app",
        "cmd_role": "Your role and how to change it",
    },
    Language.RU: {
        "greeting": "Долгосрочная аренда квартир в Дананге на карте: фильтры по цене, "
        "спальням и району, фото и контакты агента.",
        "open": "🏠 Открыть квартиры",
        "open_listing": "🏠 Открыть квартиру",
        "menu": "Квартиры",
        "no_https": "Приложение пока недоступно. Попробуйте позже.",
        "welcome": "👋 Добро пожаловать в Da Nang Apartments!\n\nДолгосрочная аренда в Дананге "
        "на карте. Расскажите, кто вы:",
        "choose_tenant": "🔍 Ищу жильё",
        "choose_landlord": "🔑 Я арендодатель",
        "tenant_done": "Отлично! Смотрите квартиры на карте, фильтруйте и связывайтесь с агентами.",
        "share_request": "Чтобы размещать квартиры, поделитесь своим контактом. Нажмите кнопку "
        "ниже — Telegram попросит подтвердить.",
        "share_button": "📱 Поделиться контактом",
        "cancel": "Отмена",
        "cancelled": "Хорошо, ваша роль не изменилась.",
        "not_own_contact": "Пожалуйста, поделитесь своим контактом с помощью кнопки ниже.",
        "landlord_done": "✅ Теперь вы арендодатель.\n\nОткройте приложение и нажмите ⚙️ в правом "
        "верхнем углу, чтобы добавить квартиры. Вы будете видеть только свои объявления.",
        "role_current": "Ваша роль: {role}.",
        "role_tenant": "арендатор",
        "role_landlord": "арендодатель",
        "role_admin": "администратор",
        "about_tenant": "Вы видите все свободные квартиры.",
        "about_landlord": "Вы управляете своими объявлениями и видите в приложении только их.",
        "about_admin": "Вы управляете всеми объявлениями. Это задаётся в настройках сервера.",
        "switch_to_landlord": "🔑 Стать арендодателем",
        "switch_to_tenant": "🔍 Стать арендатором",
        "tenant_switched": "Теперь вы арендатор. Ваши объявления остаются как есть; "
        "вернуть роль можно через /role.",
        "cmd_start": "Открыть приложение с квартирами",
        "cmd_role": "Ваша роль и как её изменить",
    },
}
CANCEL_TEXTS = frozenset(texts["cancel"] for texts in TEXTS.values())

Markup = InlineKeyboardMarkup | ReplyKeyboardMarkup | ReplyKeyboardRemove


@dataclass(frozen=True, slots=True)
class Reply:
    text: str
    markup: Markup | None = None


def language_for(code: str | None) -> Language:
    return Language.RU if (code or "").lower().startswith("ru") else Language.EN


def mini_app_url(settings: Settings, listing_id: str | None = None) -> str | None:
    """Telegram only opens Mini Apps over HTTPS."""
    base = settings.public_app_url.rstrip("/")
    if not base.startswith("https://"):
        return None
    return f"{base}/apartments/{listing_id}" if listing_id else f"{base}/"


def _listing_id(payload: str | None) -> str | None:
    return payload if payload and UUID_RE.match(payload) else None


def _open_keyboard(
    settings: Settings, language: Language, listing_id: str | None
) -> InlineKeyboardMarkup | None:
    url = mini_app_url(settings, listing_id)
    if url is None:
        return None
    texts = TEXTS[language]
    label = texts["open_listing"] if listing_id else texts["open"]
    return InlineKeyboardMarkup(
        inline_keyboard=[[InlineKeyboardButton(text=label, web_app=WebAppInfo(url=url))]]
    )


def start_reply(
    settings: Settings, language_code: str | None, payload: str | None
) -> tuple[str, InlineKeyboardMarkup | None]:
    """The usual /start answer: a button that opens the Mini App."""
    language = language_for(language_code)
    keyboard = _open_keyboard(settings, language, _listing_id(payload))
    if keyboard is None:
        return TEXTS[language]["no_https"], None
    return TEXTS[language]["greeting"], keyboard


def _open_reply(settings: Settings, language: Language, text: str, listing_id: str | None) -> Reply:
    keyboard = _open_keyboard(settings, language, listing_id)
    return Reply(text if keyboard else f"{text}\n\n{TEXTS[language]['no_https']}", keyboard)


def _role_button(
    language: Language, role: str, listing_id: str | None = None, label: str | None = None
) -> InlineKeyboardButton:
    key = label or ("choose_tenant" if role == TENANT else "choose_landlord")
    data = ":".join(part for part in (ROLE_CALLBACK, role, listing_id) if part)
    return InlineKeyboardButton(text=TEXTS[language][key], callback_data=data)


def _share_contact_keyboard(language: Language) -> ReplyKeyboardMarkup:
    texts = TEXTS[language]
    return ReplyKeyboardMarkup(
        keyboard=[
            [KeyboardButton(text=texts["share_button"], request_contact=True)],
            [KeyboardButton(text=texts["cancel"])],
        ],
        resize_keyboard=True,
        one_time_keyboard=True,
    )


def _tg_user(user: TelegramUser) -> TelegramWebAppUser:
    return TelegramWebAppUser(
        id=user.id,
        first_name=user.first_name,
        last_name=user.last_name,
        username=user.username,
        language_code=user.language_code,
    )


async def start_flow(
    session: AsyncSession, settings: Settings, tg_user: TelegramUser, payload: str | None
) -> list[Reply]:
    user = await users.upsert_telegram_user(session, settings, _tg_user(tg_user))
    language = language_for(tg_user.language_code)
    listing_id = _listing_id(payload)
    if user.role_selected_at is None and not users.is_super_admin(settings, user):
        choice = InlineKeyboardMarkup(
            inline_keyboard=[
                [_role_button(language, TENANT, listing_id)],
                [_role_button(language, LANDLORD, listing_id)],
            ]
        )
        return [Reply(TEXTS[language]["welcome"], choice)]
    text, keyboard = start_reply(settings, tg_user.language_code, payload)
    return [Reply(text, keyboard)]


async def choose_role_flow(
    session: AsyncSession, settings: Settings, tg_user: TelegramUser, data: str
) -> list[Reply]:
    """A role button was pressed (from /start or /role)."""
    _, role, *rest = data.split(":")
    listing_id = _listing_id(rest[0] if rest else None)
    language = language_for(tg_user.language_code)
    texts = TEXTS[language]
    user = await users.upsert_telegram_user(session, settings, _tg_user(tg_user))

    if role == LANDLORD:
        if user.role is UserRole.LANDLORD or users.is_super_admin(settings, user):
            return [_open_reply(settings, language, texts["landlord_done"], None)]
        if user.phone_number:
            # Shared before (e.g. was a landlord, switched to tenant, now back).
            await users.become_landlord(session, settings, user, user.phone_number)
            return [_open_reply(settings, language, texts["landlord_done"], None)]
        return [Reply(texts["share_request"], _share_contact_keyboard(language))]

    was_landlord = user.role is UserRole.LANDLORD
    await users.choose_tenant(session, settings, user)
    text = texts["tenant_switched"] if was_landlord else texts["tenant_done"]
    return [_open_reply(settings, language, text, listing_id)]


async def contact_flow(
    session: AsyncSession,
    settings: Settings,
    tg_user: TelegramUser,
    contact_user_id: int | None,
    phone_number: str,
) -> list[Reply]:
    """The user shared a contact through the keyboard button."""
    language = language_for(tg_user.language_code)
    texts = TEXTS[language]
    # Only the user's own contact counts (a forwarded or picked contact is someone else's).
    if contact_user_id != tg_user.id:
        return [Reply(texts["not_own_contact"], _share_contact_keyboard(language))]
    user = await users.upsert_telegram_user(session, settings, _tg_user(tg_user))
    await users.become_landlord(session, settings, user, phone_number)
    return [
        Reply(texts["landlord_done"], ReplyKeyboardRemove()),
        *_open_buttons(settings, language),
    ]


def _open_buttons(settings: Settings, language: Language) -> list[Reply]:
    # A reply keyboard and an inline keyboard can't share a message: send the button apart.
    keyboard = _open_keyboard(settings, language, None)
    return [Reply(TEXTS[language]["open"], keyboard)] if keyboard else []


def cancel_flow(tg_user: TelegramUser) -> list[Reply]:
    return [Reply(TEXTS[language_for(tg_user.language_code)]["cancelled"], ReplyKeyboardRemove())]


def describe_role(settings: Settings, user: User, language: Language) -> Reply:
    texts = TEXTS[language]
    role = users.effective_role(settings, user)
    if role is UserRole.ADMIN:
        name, about, buttons = texts["role_admin"], texts["about_admin"], []
    elif role is UserRole.LANDLORD:
        name, about = texts["role_landlord"], texts["about_landlord"]
        buttons = [[_role_button(language, TENANT, label="switch_to_tenant")]]
    else:
        name, about = texts["role_tenant"], texts["about_tenant"]
        buttons = [[_role_button(language, LANDLORD, label="switch_to_landlord")]]
    text = f"{texts['role_current'].format(role=name)}\n{about}"
    return Reply(text, InlineKeyboardMarkup(inline_keyboard=buttons) if buttons else None)


async def role_flow(
    session: AsyncSession, settings: Settings, tg_user: TelegramUser
) -> list[Reply]:
    user = await users.upsert_telegram_user(session, settings, _tg_user(tg_user))
    return [describe_role(settings, user, language_for(tg_user.language_code))]


async def _send(message: Message, replies: list[Reply]) -> None:
    for reply in replies:
        await message.answer(reply.text, reply_markup=reply.markup)


def build_router(settings: Settings, sessions: async_sessionmaker[AsyncSession]) -> Router:
    router = Router()

    @router.message(CommandStart())
    async def on_start(message: Message, command: CommandObject) -> None:
        if message.from_user is None:
            return
        async with sessions() as session:
            replies = await start_flow(session, settings, message.from_user, command.args)
        await _send(message, replies)

    @router.message(Command("role"))
    async def on_role(message: Message) -> None:
        if message.from_user is None:
            return
        async with sessions() as session:
            replies = await role_flow(session, settings, message.from_user)
        await _send(message, replies)

    @router.callback_query(F.data.startswith(f"{ROLE_CALLBACK}:"))
    async def on_role_chosen(callback: CallbackQuery) -> None:
        await callback.answer()
        message = callback.message
        if not isinstance(message, Message) or callback.data is None:
            return
        async with sessions() as session:
            replies = await choose_role_flow(session, settings, callback.from_user, callback.data)
        # The choice is made: remove the buttons so it can't be pressed twice.
        await message.edit_reply_markup(reply_markup=None)
        for reply in replies:
            await message.answer(reply.text, reply_markup=reply.markup)

    @router.message(F.contact)
    async def on_contact(message: Message) -> None:
        if message.from_user is None or message.contact is None:
            return
        contact = message.contact
        async with sessions() as session:
            replies = await contact_flow(
                session, settings, message.from_user, contact.user_id, contact.phone_number
            )
        await _send(message, replies)

    @router.message(F.text.in_(CANCEL_TEXTS))
    async def on_cancel(message: Message) -> None:
        if message.from_user is not None:
            await _send(message, cancel_flow(message.from_user))

    return router
