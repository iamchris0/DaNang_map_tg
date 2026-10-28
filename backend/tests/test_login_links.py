"""/login: one-time browser sign-in links for administrators and landlords."""

import re
from datetime import UTC, datetime, timedelta

import pytest
from aiogram.types import User as TelegramUser
from httpx import AsyncClient
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.bot.handlers import login_flow
from app.core.config import Settings
from app.models import LoginCode
from app.models.enums import UserRole
from tests.conftest import ADMIN_TG_ID, USER_TG_ID, requires_db
from tests.factories import make_user

pytestmark = [pytest.mark.db, requires_db]

LANDLORD_TG_ID = 3003
LINK_RE = re.compile(r"https://app\.example/login\?code=([A-Za-z0-9_-]+)")


def _tg(user_id: int) -> TelegramUser:
    return TelegramUser(id=user_id, is_bot=False, first_name="Ann")


@pytest.fixture
def https_settings(settings: Settings) -> Settings:
    settings.public_app_url = "https://app.example"
    return settings


async def _link_code(db: AsyncSession, settings: Settings, telegram_user_id: int) -> str:
    [reply] = await login_flow(db, settings, _tg(telegram_user_id))
    assert reply.link_preview is False  # Telegram must not open the link for a preview
    match = LINK_RE.search(reply.text)
    assert match, reply.text
    return match.group(1)


async def test_link_signs_in_once(
    api: AsyncClient, db: AsyncSession, https_settings: Settings
) -> None:
    await make_user(db, LANDLORD_TG_ID, role=UserRole.LANDLORD)
    code = await _link_code(db, https_settings, LANDLORD_TG_ID)

    stored = (await db.scalars(select(LoginCode))).all()
    assert len(stored) == 1 and stored[0].code_hash != code  # only the hash is kept

    response = await api.post("/api/auth/link", json={"code": code})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["user"]["role"] == "landlord" and body["user"]["is_admin"] is True
    headers = {"Authorization": f"Bearer {body['access_token']}"}
    assert (await api.get("/api/admin/dashboard", headers=headers)).status_code == 200

    again = await api.post("/api/auth/link", json={"code": code})
    assert again.status_code == 401
    assert again.json()["error"]["code"] == "invalid_login_link"


async def test_expired_and_unknown_links_are_refused(
    api: AsyncClient, db: AsyncSession, https_settings: Settings
) -> None:
    await make_user(db, ADMIN_TG_ID)
    code = await _link_code(db, https_settings, ADMIN_TG_ID)
    await db.execute(update(LoginCode).values(expires_at=datetime.now(UTC) - timedelta(seconds=1)))
    await db.commit()
    expired = await api.post("/api/auth/link", json={"code": code})
    assert expired.status_code == 401

    unknown = await api.post("/api/auth/link", json={"code": "x" * 43})
    assert unknown.status_code == 401
    assert (await api.post("/api/auth/link", json={"code": "short"})).status_code == 422


async def test_tenants_get_no_link(db: AsyncSession, https_settings: Settings) -> None:
    await make_user(db, USER_TG_ID)
    [reply] = await login_flow(db, https_settings, _tg(USER_TG_ID))
    assert reply.text.startswith("The admin panel is for landlords and administrators")
    assert (await db.scalars(select(LoginCode))).all() == []


async def test_new_link_clears_spent_ones(db: AsyncSession, https_settings: Settings) -> None:
    await make_user(db, ADMIN_TG_ID)
    await _link_code(db, https_settings, ADMIN_TG_ID)
    await db.execute(update(LoginCode).values(used_at=datetime.now(UTC)))
    await db.commit()
    await _link_code(db, https_settings, ADMIN_TG_ID)
    db.expire_all()
    remaining = (await db.scalars(select(LoginCode))).all()
    assert len(remaining) == 1 and remaining[0].used_at is None
