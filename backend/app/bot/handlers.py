"""Bot conversation.

- /start: the first time, a language question (English, Russian, Vietnamese), then a role
  choice (tenant or landlord); afterwards a button that opens the Mini App (optionally on a
  specific listing from a deep link). Messages use the chosen language; English until then.
- Landlord: Telegram's contact button asks the user to share their phone number; sharing
  their own contact makes them a landlord, who manages their own listings in the Mini App.
- /role: shows the current role and offers to change it.
- /language: changes the language (shared with the Mini App through the user profile).
- /login: administrators and landlords get a one-time link that signs them in on a browser.

The conversation logic lives in `*_flow` functions that return the replies to send, so it
can be tested without Telegram.
"""

import re
from collections.abc import Awaitable, Callable
from dataclasses import dataclass

from aiogram import F, Router
from aiogram.filters import Command, CommandObject, CommandStart
from aiogram.types import (
    CallbackQuery,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    KeyboardButton,
    LinkPreviewOptions,
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
from app.services import login_links, users

UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)
ROLE_CALLBACK = "role"
LANGUAGE_CALLBACK = "lang"
# Where a language button was shown: the first /start (continue to the role question) or
# /language (just confirm).
FROM_START, FROM_COMMAND = "start", "set"
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
        "about_landlord": "You manage your own listings and see only them in the app. "
        "Use /login to open the admin panel in a browser.",
        "about_admin": "You manage all listings. This is set in the server configuration. "
        "Use /login to open the admin panel in a browser.",
        "switch_to_landlord": "🔑 Become a landlord",
        "switch_to_tenant": "🔍 Switch to tenant",
        "tenant_switched": "You are a tenant now. Your listings stay as they are; "
        "switch back with /role to manage them.",
        "cmd_start": "Open the apartments app",
        "cmd_role": "Your role and how to change it",
        "cmd_language": "Change the language",
        "language_set": "✅ Language: {language}.",
        "login_link": "🔐 Your sign-in link for the admin panel in a browser:\n\n{url}\n\n"
        "It works once and expires in {minutes} minutes. Don't share it: anyone with it can "
        "sign in as you.",
        "login_denied": "The admin panel is for landlords and administrators. To list "
        "apartments, become a landlord with /role.",
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
        "about_landlord": "Вы управляете своими объявлениями и видите в приложении только их. "
        "Команда /login даёт вход в панель управления из браузера.",
        "about_admin": "Вы управляете всеми объявлениями. Это задаётся в настройках сервера. "
        "Команда /login даёт вход в панель управления из браузера.",
        "switch_to_landlord": "🔑 Стать арендодателем",
        "switch_to_tenant": "🔍 Стать арендатором",
        "tenant_switched": "Теперь вы арендатор. Ваши объявления остаются как есть; "
        "вернуть роль можно через /role.",
        "cmd_start": "Открыть приложение с квартирами",
        "cmd_role": "Ваша роль и как её изменить",
        "cmd_language": "Сменить язык",
        "language_set": "✅ Язык: {language}.",
        "login_link": "🔐 Ваша ссылка для входа в панель управления в браузере:\n\n{url}\n\n"
        "Она работает один раз и действует {minutes} мин. Никому её не пересылайте: по ней "
        "можно войти от вашего имени.",
        "login_denied": "Панель управления доступна арендодателям и администраторам. Чтобы "
        "размещать квартиры, станьте арендодателем через /role.",
    },
    Language.VI: {
        "greeting": "Thuê căn hộ dài hạn tại Đà Nẵng trên bản đồ: lọc theo giá, số phòng ngủ "
        "và quận, xem ảnh và liên hệ môi giới.",
        "open": "🏠 Xem căn hộ",
        "open_listing": "🏠 Mở căn hộ này",
        "menu": "Căn hộ",
        "no_https": "Ứng dụng hiện chưa sẵn sàng. Vui lòng thử lại sau.",
        "welcome": "👋 Chào mừng bạn đến với Da Nang Apartments!\n\nThuê căn hộ dài hạn tại "
        "Đà Nẵng trên bản đồ. Bạn là:",
        "choose_tenant": "🔍 Tôi đang tìm nhà",
        "choose_landlord": "🔑 Tôi là chủ nhà",
        "tenant_done": "Tuyệt vời! Xem căn hộ trên bản đồ, lọc và liên hệ môi giới.",
        "share_request": "Để đăng căn hộ, vui lòng chia sẻ số liên lạc của bạn. Nhấn nút bên "
        "dưới, Telegram sẽ yêu cầu bạn xác nhận.",
        "share_button": "📱 Chia sẻ số liên lạc",
        "cancel": "Hủy",
        "cancelled": "Được rồi, vai trò của bạn không thay đổi.",
        "not_own_contact": "Vui lòng chia sẻ số liên lạc của chính bạn bằng nút bên dưới.",
        "landlord_done": "✅ Bạn đã là chủ nhà.\n\nMở ứng dụng và nhấn ⚙️ ở góc trên bên phải "
        "để thêm căn hộ. Bạn sẽ chỉ thấy tin đăng của mình.",
        "role_current": "Vai trò của bạn: {role}.",
        "role_tenant": "người thuê",
        "role_landlord": "chủ nhà",
        "role_admin": "quản trị viên",
        "about_tenant": "Bạn thấy tất cả căn hộ còn trống.",
        "about_landlord": "Bạn quản lý tin đăng của mình và chỉ thấy chúng trong ứng dụng. "
        "Dùng /login để mở bảng quản trị trên trình duyệt.",
        "about_admin": "Bạn quản lý tất cả tin đăng. Điều này được thiết lập trong cấu hình "
        "máy chủ. "
        "Dùng /login để mở bảng quản trị trên trình duyệt.",
        "switch_to_landlord": "🔑 Trở thành chủ nhà",
        "switch_to_tenant": "🔍 Chuyển sang người thuê",
        "tenant_switched": "Bạn đã là người thuê. Tin đăng của bạn vẫn giữ nguyên; dùng /role "
        "để quay lại quản lý chúng.",
        "cmd_start": "Mở ứng dụng căn hộ",
        "cmd_role": "Vai trò của bạn và cách thay đổi",
        "cmd_language": "Đổi ngôn ngữ",
        "language_set": "✅ Ngôn ngữ: {language}.",
        "login_link": "🔐 Liên kết đăng nhập bảng quản trị trên trình duyệt của bạn:\n\n{url}\n\n"
        "Liên kết chỉ dùng được một lần và hết hạn sau {minutes} phút. Đừng chia sẻ: bất kỳ ai "
        "có liên kết đều có thể đăng nhập bằng tài khoản của bạn.",
        "login_denied": "Bảng quản trị dành cho chủ nhà và quản trị viên. Để đăng căn hộ, hãy "
        "trở thành chủ nhà bằng /role.",
    },
}
# Asked before anything else, so it is written in all three languages.
LANGUAGE_QUESTION = "🌐 Choose your language\nВыберите язык\nChọn ngôn ngữ"
LANGUAGE_NAMES = {
    Language.EN: "🇬🇧 English",
    Language.RU: "🇷🇺 Русский",
    Language.VI: "🇻🇳 Tiếng Việt",
}
CANCEL_TEXTS = frozenset(texts["cancel"] for texts in TEXTS.values())

Markup = InlineKeyboardMarkup | ReplyKeyboardMarkup | ReplyKeyboardRemove


@dataclass(frozen=True, slots=True)
class Reply:
    text: str
    markup: Markup | None = None
    # Off for sign-in links: no preview card, and Telegram doesn't fetch the page.
    link_preview: bool = True


ChoiceFlow = Callable[[AsyncSession, Settings, TelegramUser, str], Awaitable[list[Reply]]]


def user_language(user: User) -> Language:
    """The language the user picked; English until they do."""
    return user.preferred_language or Language.EN


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
    settings: Settings, language: Language, payload: str | None
) -> tuple[str, InlineKeyboardMarkup | None]:
    """The usual /start answer: a button that opens the Mini App."""
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


def _language_question(origin: str, listing_id: str | None = None) -> Reply:
    buttons = [
        [
            InlineKeyboardButton(
                text=name,
                callback_data=":".join(
                    part for part in (LANGUAGE_CALLBACK, origin, language.value, listing_id) if part
                ),
            )
        ]
        for language, name in LANGUAGE_NAMES.items()
    ]
    return Reply(LANGUAGE_QUESTION, InlineKeyboardMarkup(inline_keyboard=buttons))


def _welcome(settings: Settings, user: User, listing_id: str | None) -> Reply:
    """After the language: the role question the first time, else the usual greeting."""
    language = user_language(user)
    if user.role_selected_at is None and not users.is_super_admin(settings, user):
        choice = InlineKeyboardMarkup(
            inline_keyboard=[
                [_role_button(language, TENANT, listing_id)],
                [_role_button(language, LANDLORD, listing_id)],
            ]
        )
        return Reply(TEXTS[language]["welcome"], choice)
    text, keyboard = start_reply(settings, language, listing_id)
    return Reply(text, keyboard)


async def start_flow(
    session: AsyncSession, settings: Settings, tg_user: TelegramUser, payload: str | None
) -> list[Reply]:
    user = await users.upsert_telegram_user(session, settings, _tg_user(tg_user))
    listing_id = _listing_id(payload)
    if user.language_selected_at is None:
        return [_language_question(FROM_START, listing_id)]
    return [_welcome(settings, user, listing_id)]


async def language_flow(
    session: AsyncSession, settings: Settings, tg_user: TelegramUser
) -> list[Reply]:
    await users.upsert_telegram_user(session, settings, _tg_user(tg_user))
    return [_language_question(FROM_COMMAND)]


async def choose_language_flow(
    session: AsyncSession, settings: Settings, tg_user: TelegramUser, data: str
) -> list[Reply]:
    """A language button was pressed (from the first /start or /language)."""
    _, origin, code, *rest = data.split(":")
    language = Language(code) if code in Language._value2member_map_ else Language.EN
    user = await users.upsert_telegram_user(session, settings, _tg_user(tg_user))
    await users.set_language(session, user, language)
    if origin == FROM_START:
        return [_welcome(settings, user, _listing_id(rest[0] if rest else None))]
    confirmation = TEXTS[language]["language_set"].format(language=LANGUAGE_NAMES[language])
    return [_open_reply(settings, language, confirmation, None)]


async def choose_role_flow(
    session: AsyncSession, settings: Settings, tg_user: TelegramUser, data: str
) -> list[Reply]:
    """A role button was pressed (from /start or /role)."""
    _, role, *rest = data.split(":")
    listing_id = _listing_id(rest[0] if rest else None)
    user = await users.upsert_telegram_user(session, settings, _tg_user(tg_user))
    language = user_language(user)
    texts = TEXTS[language]

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
    user = await users.upsert_telegram_user(session, settings, _tg_user(tg_user))
    language = user_language(user)
    texts = TEXTS[language]
    # Only the user's own contact counts (a forwarded or picked contact is someone else's).
    if contact_user_id != tg_user.id:
        return [Reply(texts["not_own_contact"], _share_contact_keyboard(language))]
    await users.become_landlord(session, settings, user, phone_number)
    return [
        Reply(texts["landlord_done"], ReplyKeyboardRemove()),
        *_open_buttons(settings, language),
    ]


def _open_buttons(settings: Settings, language: Language) -> list[Reply]:
    # A reply keyboard and an inline keyboard can't share a message: send the button apart.
    keyboard = _open_keyboard(settings, language, None)
    return [Reply(TEXTS[language]["open"], keyboard)] if keyboard else []


async def cancel_flow(
    session: AsyncSession, settings: Settings, tg_user: TelegramUser
) -> list[Reply]:
    user = await users.upsert_telegram_user(session, settings, _tg_user(tg_user))
    return [Reply(TEXTS[user_language(user)]["cancelled"], ReplyKeyboardRemove())]


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


async def login_flow(
    session: AsyncSession, settings: Settings, tg_user: TelegramUser
) -> list[Reply]:
    """/login: a one-time link that signs an administrator or landlord in on a browser."""
    user = await users.upsert_telegram_user(session, settings, _tg_user(tg_user))
    texts = TEXTS[user_language(user)]
    if not users.is_admin(settings, user):
        return [Reply(texts["login_denied"])]
    code = await login_links.issue_code(session, settings, user)
    text = texts["login_link"].format(
        url=login_links.login_url(settings, code),
        minutes=max(1, settings.login_link_ttl_seconds // 60),
    )
    return [Reply(text, link_preview=False)]


async def role_flow(
    session: AsyncSession, settings: Settings, tg_user: TelegramUser
) -> list[Reply]:
    user = await users.upsert_telegram_user(session, settings, _tg_user(tg_user))
    return [describe_role(settings, user, user_language(user))]


async def _send(message: Message, replies: list[Reply]) -> None:
    for reply in replies:
        preview = None if reply.link_preview else LinkPreviewOptions(is_disabled=True)
        await message.answer(reply.text, reply_markup=reply.markup, link_preview_options=preview)


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

    @router.message(Command("login"))
    async def on_login(message: Message) -> None:
        if message.from_user is None:
            return
        async with sessions() as session:
            replies = await login_flow(session, settings, message.from_user)
        await _send(message, replies)

    @router.message(Command("language"))
    async def on_language(message: Message) -> None:
        if message.from_user is None:
            return
        async with sessions() as session:
            replies = await language_flow(session, settings, message.from_user)
        await _send(message, replies)

    async def answer_choice(callback: CallbackQuery, flow: ChoiceFlow) -> None:
        await callback.answer()
        message = callback.message
        if not isinstance(message, Message) or callback.data is None:
            return
        async with sessions() as session:
            replies = await flow(session, settings, callback.from_user, callback.data)
        # The choice is made: remove the buttons so it can't be pressed twice.
        await message.edit_reply_markup(reply_markup=None)
        await _send(message, replies)

    @router.callback_query(F.data.startswith(f"{ROLE_CALLBACK}:"))
    async def on_role_chosen(callback: CallbackQuery) -> None:
        await answer_choice(callback, choose_role_flow)

    @router.callback_query(F.data.startswith(f"{LANGUAGE_CALLBACK}:"))
    async def on_language_chosen(callback: CallbackQuery) -> None:
        await answer_choice(callback, choose_language_flow)

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
        if message.from_user is None:
            return
        async with sessions() as session:
            replies = await cancel_flow(session, settings, message.from_user)
        await _send(message, replies)

    return router
