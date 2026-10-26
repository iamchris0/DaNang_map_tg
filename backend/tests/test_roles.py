"""Tenant / landlord roles: the bot conversation and what each role can see and manage."""

import pytest
from aiogram.types import InlineKeyboardMarkup, ReplyKeyboardMarkup, ReplyKeyboardRemove
from aiogram.types import User as TelegramUser
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.bot.handlers import (
    choose_role_flow,
    contact_flow,
    role_flow,
    start_flow,
)
from app.core.config import Settings
from app.models import Apartment, User
from app.models.enums import ApartmentStatus, UserRole
from tests.conftest import ADMIN_TG_ID, TEST_BOT_TOKEN, USER_TG_ID, requires_db
from tests.factories import auth_headers, make_apartment, make_user, sign_init_data

pytestmark = [pytest.mark.db, requires_db]

LANDLORD_TG_ID = 3003
OTHER_LANDLORD_TG_ID = 4004
CITY_BBOX = "107.80,15.85,108.40,16.25"
LISTING_ID = "11111111-1111-4111-8111-111111111111"


def _tg(user_id: int, language: str = "en") -> TelegramUser:
    return TelegramUser(id=user_id, is_bot=False, first_name="Ann", language_code=language)


async def _stored(db: AsyncSession, telegram_user_id: int) -> User:
    db.expire_all()
    user = await db.scalar(select(User).where(User.telegram_user_id == telegram_user_id))
    assert user is not None
    return user


@pytest.fixture
def https_settings(settings: Settings) -> Settings:
    settings.public_app_url = "https://app.example"
    return settings


def _inline(markup: object) -> list[tuple[str, str | None]]:
    assert isinstance(markup, InlineKeyboardMarkup)
    return [
        (button.text, button.callback_data or (button.web_app.url if button.web_app else None))
        for row in markup.inline_keyboard
        for button in row
    ]


# --- Bot conversation -------------------------------------------------------------------


async def test_first_start_asks_for_a_role_then_opens_the_app(
    db: AsyncSession, https_settings: Settings
) -> None:
    [welcome] = await start_flow(db, https_settings, _tg(USER_TG_ID), LISTING_ID)
    assert welcome.text.startswith("👋 Welcome")
    assert _inline(welcome.markup) == [
        ("🔍 I'm looking for a place", f"role:tenant:{LISTING_ID}"),
        ("🔑 I'm a landlord", f"role:landlord:{LISTING_ID}"),
    ]

    [done] = await choose_role_flow(
        db, https_settings, _tg(USER_TG_ID), f"role:tenant:{LISTING_ID}"
    )
    assert done.text.startswith("Great!")
    # The listing from the deep link opens right after the choice.
    assert _inline(done.markup) == [
        ("🏠 Open this apartment", f"https://app.example/apartments/{LISTING_ID}")
    ]
    user = await _stored(db, USER_TG_ID)
    assert user.role is UserRole.USER and user.role_selected_at is not None

    # Later /start: no more questions.
    [again] = await start_flow(db, https_settings, _tg(USER_TG_ID), None)
    assert again.text.startswith("Long-term apartments")
    assert _inline(again.markup) == [("🏠 Open apartments", "https://app.example/")]


async def test_becoming_a_landlord_requires_sharing_own_contact(
    db: AsyncSession, https_settings: Settings
) -> None:
    await start_flow(db, https_settings, _tg(LANDLORD_TG_ID, "ru"), None)
    [request] = await choose_role_flow(
        db, https_settings, _tg(LANDLORD_TG_ID, "ru"), "role:landlord"
    )
    assert request.text.startswith("Чтобы размещать квартиры")
    assert isinstance(request.markup, ReplyKeyboardMarkup)
    share = request.markup.keyboard[0][0]
    assert share.request_contact is True and share.text == "📱 Поделиться контактом"
    assert (await _stored(db, LANDLORD_TG_ID)).role is UserRole.USER

    # Someone else's contact is refused.
    [refused] = await contact_flow(
        db, https_settings, _tg(LANDLORD_TG_ID, "ru"), USER_TG_ID, "+84 900 000 001"
    )
    assert refused.text.startswith("Пожалуйста, поделитесь своим")
    assert (await _stored(db, LANDLORD_TG_ID)).role is UserRole.USER

    done, open_app = await contact_flow(
        db, https_settings, _tg(LANDLORD_TG_ID, "ru"), LANDLORD_TG_ID, "+84 900 000 002"
    )
    assert done.text.startswith("✅ Теперь вы арендодатель")
    assert isinstance(done.markup, ReplyKeyboardRemove)
    assert _inline(open_app.markup) == [("🏠 Открыть квартиры", "https://app.example/")]
    landlord = await _stored(db, LANDLORD_TG_ID)
    assert landlord.role is UserRole.LANDLORD
    assert landlord.phone_number == "+84 900 000 002"
    assert landlord.role_selected_at is not None


async def test_role_command_shows_and_changes_the_role(
    db: AsyncSession, https_settings: Settings
) -> None:
    await make_user(db, LANDLORD_TG_ID, role=UserRole.LANDLORD, phone_number="+84 1")
    [info] = await role_flow(db, https_settings, _tg(LANDLORD_TG_ID))
    assert info.text.startswith("Your role: landlord.")
    assert _inline(info.markup) == [("🔍 Switch to tenant", "role:tenant")]

    [switched] = await choose_role_flow(db, https_settings, _tg(LANDLORD_TG_ID), "role:tenant")
    assert switched.text.startswith("You are a tenant now")
    [info] = await role_flow(db, https_settings, _tg(LANDLORD_TG_ID))
    assert info.text.startswith("Your role: tenant.")
    assert _inline(info.markup) == [("🔑 Become a landlord", "role:landlord")]

    # The contact was shared before, so switching back needs no second confirmation.
    [back] = await choose_role_flow(db, https_settings, _tg(LANDLORD_TG_ID), "role:landlord")
    assert back.text.startswith("✅ You are a landlord now")
    assert (await _stored(db, LANDLORD_TG_ID)).role is UserRole.LANDLORD


async def test_configured_administrator_is_not_asked_for_a_role(
    db: AsyncSession, https_settings: Settings
) -> None:
    [reply] = await start_flow(db, https_settings, _tg(ADMIN_TG_ID), None)
    assert reply.text.startswith("Long-term apartments")
    [info] = await role_flow(db, https_settings, _tg(ADMIN_TG_ID))
    assert info.text.startswith("Your role: administrator.")
    assert info.markup is None


# --- What each role can see and manage ------------------------------------------------


async def test_landlord_keeps_the_role_and_gets_the_admin_panel(
    api: AsyncClient, db: AsyncSession
) -> None:
    await make_user(db, LANDLORD_TG_ID, role=UserRole.LANDLORD)
    user = {"id": LANDLORD_TG_ID, "first_name": "Ann"}
    response = await api.post(
        "/api/auth/telegram", json={"init_data": sign_init_data(TEST_BOT_TOKEN, user)}
    )
    assert response.status_code == 200, response.text
    assert response.json()["user"]["is_admin"] is True
    assert response.json()["user"]["role"] == "landlord"
    assert (await _stored(db, LANDLORD_TG_ID)).role is UserRole.LANDLORD


async def _listings(db: AsyncSession) -> tuple[dict[str, User], dict[str, Apartment]]:
    people = {
        "admin": await make_user(db, ADMIN_TG_ID, role=UserRole.ADMIN),
        "landlord": await make_user(db, LANDLORD_TG_ID, role=UserRole.LANDLORD),
        "other": await make_user(db, OTHER_LANDLORD_TG_ID, role=UserRole.LANDLORD),
        "tenant": await make_user(db, USER_TG_ID),
    }
    listings = {
        "mine": await make_apartment(db, title="Mine", created_by=people["landlord"].id),
        "theirs": await make_apartment(db, title="Theirs", created_by=people["other"].id),
        "my_draft": await make_apartment(
            db, title="My draft", status=ApartmentStatus.DRAFT, created_by=people["landlord"].id
        ),
    }
    return people, listings


async def test_landlord_manages_only_own_listings(
    api: AsyncClient, db: AsyncSession, settings: Settings
) -> None:
    people, listings = await _listings(db)
    landlord = auth_headers(settings, people["landlord"])
    admin = auth_headers(settings, people["admin"])
    landlord_id = people["landlord"].id

    page = (await api.get("/api/admin/apartments", headers=landlord)).json()
    assert {item["title"] for item in page["items"]} == {"Mine", "My draft"}
    dashboard = (await api.get("/api/admin/dashboard", headers=landlord)).json()
    assert (dashboard["total"], dashboard["available"], dashboard["draft"]) == (2, 1, 1)

    mine, theirs = listings["mine"].id, listings["theirs"].id
    assert (await api.get(f"/api/admin/apartments/{mine}", headers=landlord)).status_code == 200
    base = f"/api/admin/apartments/{theirs}"
    attempts: list[tuple[str, str, dict[str, object] | None]] = [
        ("GET", base, None),
        ("PATCH", base, {"title": "Hijacked"}),
        ("PATCH", f"{base}/status", {"status": "archived"}),
        ("DELETE", base, None),
        ("PATCH", f"{base}/images/order", {"image_ids": []}),
        ("GET", f"{base}/telegram-preview", None),
        ("GET", f"{base}/telegram-publications", None),
    ]
    for method, path, body in attempts:
        response = await api.request(method, path, json=body, headers=landlord)
        assert response.status_code == 404, (method, path, response.text)
        assert response.json()["error"]["code"] == "listing_not_found"
    db.expire_all()
    untouched = await db.get(Apartment, theirs)
    assert untouched is not None and untouched.title == "Theirs" and untouched.deleted_at is None

    # New listings belong to their creator.
    created = await api.post("/api/admin/apartments", json={"title": "New"}, headers=landlord)
    assert created.status_code == 201
    stored = await db.get(Apartment, created.json()["id"])
    assert stored is not None and stored.created_by == landlord_id

    # Configured administrators still manage everything.
    page = (await api.get("/api/admin/apartments?page_size=50", headers=admin)).json()
    assert {"Mine", "Theirs", "My draft", "New"} <= {item["title"] for item in page["items"]}
    assert (await api.get(base, headers=admin)).status_code == 200


async def test_landlord_sees_only_own_listings_on_the_map(
    api: AsyncClient, db: AsyncSession, settings: Settings
) -> None:
    people, listings = await _listings(db)
    public = {str(listings["mine"].id), str(listings["theirs"].id)}

    async def visible(headers: dict[str, str] | None = None) -> tuple[set[str], set[str]]:
        cards = (await api.get("/api/apartments?page_size=50", headers=headers)).json()
        markers = (await api.get(f"/api/apartments/map?bbox={CITY_BBOX}", headers=headers)).json()
        return {c["id"] for c in cards["items"]}, {m["id"] for m in markers["markers"]}

    assert await visible() == (public, public)
    assert await visible(auth_headers(settings, people["tenant"])) == (public, public)
    assert await visible(auth_headers(settings, people["admin"])) == (public, public)
    mine = {str(listings["mine"].id)}
    assert await visible(auth_headers(settings, people["landlord"])) == (mine, mine)
    # A broken token is treated as anonymous on public pages.
    assert await visible({"Authorization": "Bearer garbage"}) == (public, public)
    # Shared links keep working for everyone.
    theirs = f"/api/apartments/{listings['theirs'].id}"
    response = await api.get(theirs, headers=auth_headers(settings, people["landlord"]))
    assert response.status_code == 200
