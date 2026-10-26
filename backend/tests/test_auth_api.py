import time

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.models import User
from app.models.enums import Language, UserRole
from tests.conftest import ADMIN_TG_ID, TEST_BOT_TOKEN, USER_TG_ID, requires_db
from tests.factories import auth_headers, make_user, sign_init_data

pytestmark = [pytest.mark.db, requires_db]


def _tg_user(tg_id: int, **extra: object) -> dict[str, object]:
    return {"id": tg_id, "first_name": "Test", "username": f"user{tg_id}", **extra}


async def _login(api: AsyncClient, init_data: str) -> dict[str, object]:
    response = await api.post("/api/auth/telegram", json={"init_data": init_data})
    assert response.status_code == 200, response.text
    body: dict[str, object] = response.json()
    return body


async def test_login_creates_regular_user(api: AsyncClient, db: AsyncSession) -> None:
    body = await _login(
        api,
        sign_init_data(
            TEST_BOT_TOKEN, _tg_user(USER_TG_ID, language_code="ru"), start_param="listing-1"
        ),
    )
    assert body["token_type"] == "bearer"
    assert body["start_param"] == "listing-1"
    assert body["user"] == {
        "id": body["user"]["id"],  # type: ignore[index]
        "telegram_user_id": USER_TG_ID,
        "username": f"user{USER_TG_ID}",
        "display_name": "Test",
        "preferred_language": "ru",
        "is_admin": False,
        "role": "user",
    }
    user = await db.scalar(select(User).where(User.telegram_user_id == USER_TG_ID))
    assert user is not None and user.role is UserRole.USER


async def test_login_marks_configured_admin(api: AsyncClient) -> None:
    body = await _login(api, sign_init_data(TEST_BOT_TOKEN, _tg_user(ADMIN_TG_ID)))
    assert body["user"]["is_admin"] is True  # type: ignore[index]


async def test_relogin_updates_profile_keeps_language(api: AsyncClient, db: AsyncSession) -> None:
    await _login(api, sign_init_data(TEST_BOT_TOKEN, _tg_user(USER_TG_ID, language_code="ru")))
    body = await _login(
        api,
        sign_init_data(
            TEST_BOT_TOKEN,
            {"id": USER_TG_ID, "first_name": "Renamed", "username": "new_name"},
        ),
    )
    assert body["user"]["username"] == "new_name"  # type: ignore[index]
    assert body["user"]["preferred_language"] == "ru"  # type: ignore[index]
    users = (await db.scalars(select(User).where(User.telegram_user_id == USER_TG_ID))).all()
    assert len(users) == 1


async def test_username_alone_never_grants_admin(api: AsyncClient, settings: Settings) -> None:
    # Same username as an admin would have, different id.
    settings.admin_telegram_user_ids = frozenset({ADMIN_TG_ID})
    body = await _login(
        api, sign_init_data(TEST_BOT_TOKEN, {"id": 5555, "first_name": "X", "username": "admin"})
    )
    assert body["user"]["is_admin"] is False  # type: ignore[index]


@pytest.mark.parametrize(
    ("make_init_data", "reason"),
    [
        (lambda: sign_init_data("999:wrong-token", _tg_user(1)), "invalid_signature"),
        (
            lambda: sign_init_data(TEST_BOT_TOKEN, _tg_user(1), auth_date=int(time.time()) - 10**6),
            "expired",
        ),
        (lambda: sign_init_data(TEST_BOT_TOKEN, None), "missing_user"),
    ],
)
async def test_login_rejects_bad_init_data(
    api: AsyncClient, make_init_data: object, reason: str
) -> None:
    init_data = make_init_data()  # type: ignore[operator]
    response = await api.post("/api/auth/telegram", json={"init_data": init_data})
    assert response.status_code == 401
    assert response.json()["error"] == {
        "code": "invalid_init_data",
        "message": "Telegram authentication failed",
        "details": {"reason": reason},
    }


async def test_me_requires_token(api: AsyncClient) -> None:
    assert (await api.get("/api/auth/me")).status_code == 401
    bad = await api.get("/api/auth/me", headers={"Authorization": "Bearer garbage"})
    assert bad.status_code == 401
    assert bad.json()["error"]["code"] == "unauthorized"


async def test_me_and_language_update(
    api: AsyncClient, db: AsyncSession, settings: Settings
) -> None:
    user = await make_user(db, USER_TG_ID)
    headers = auth_headers(settings, user)
    assert (await api.get("/api/auth/me", headers=headers)).json()["preferred_language"] is None

    response = await api.patch("/api/auth/me", json={"preferred_language": "ru"}, headers=headers)
    assert response.status_code == 200
    assert response.json()["preferred_language"] == "ru"
    await db.refresh(user)
    assert user.preferred_language is Language.RU

    invalid = await api.patch("/api/auth/me", json={"preferred_language": "vi"}, headers=headers)
    assert invalid.status_code == 422


async def test_dev_login_disabled_by_default(api: AsyncClient) -> None:
    response = await api.post("/api/auth/dev", json={"telegram_user_id": ADMIN_TG_ID})
    assert response.status_code == 404


async def test_dev_login_when_enabled(api: AsyncClient, settings: Settings) -> None:
    settings.dev_auth_enabled = True
    response = await api.post("/api/auth/dev", json={"telegram_user_id": ADMIN_TG_ID})
    assert response.status_code == 200
    assert response.json()["user"]["is_admin"] is True


async def test_auth_rate_limited(api: AsyncClient, settings: Settings) -> None:
    settings.rate_limit_auth = "3/minute"
    init_data = sign_init_data(TEST_BOT_TOKEN, _tg_user(USER_TG_ID))
    codes = [
        (await api.post("/api/auth/telegram", json={"init_data": init_data})).status_code
        for _ in range(4)
    ]
    assert codes == [200, 200, 200, 429]


@pytest.mark.parametrize(
    "header", ["cf-connecting-ip", "x-forwarded-for", "forwarded", "x-real-ip"]
)
async def test_dev_login_refused_through_proxy_or_tunnel(
    api: AsyncClient, settings: Settings, header: str
) -> None:
    settings.dev_auth_enabled = True
    response = await api.post(
        "/api/auth/dev", json={"telegram_user_id": ADMIN_TG_ID}, headers={header: "203.0.113.7"}
    )
    assert response.status_code == 404


async def test_client_error_reports_are_logged(
    api: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.api.routes import client_log

    logged: list[tuple[object, ...]] = []
    monkeypatch.setattr(client_log.logger, "warning", lambda *args: logged.append(args))
    payload = {"message": "TypeError: x is undefined", "source": "main.js:1", "platform": "ios"}
    response = await api.post("/api/client-errors", json=payload)
    assert response.status_code == 204
    assert logged and "TypeError: x is undefined" in logged[0]
    too_long = await api.post("/api/client-errors", json={"message": "x" * 5000})
    assert too_long.status_code == 422
