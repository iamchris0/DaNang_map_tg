import httpx
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.services import geocoding
from tests.conftest import ADMIN_TG_ID, USER_TG_ID, requires_db
from tests.factories import auth_headers, make_user

pytestmark = [pytest.mark.db, requires_db]

NOMINATIM_RESPONSE = [
    {
        "display_name": "My Khe Beach, Sơn Trà, Đà Nẵng",
        "lat": "16.0612",
        "lon": "108.2475",
        "addresstype": "beach",
    },
    {"display_name": "broken row without coordinates"},
]


@pytest.fixture(autouse=True)
def _clear_cache() -> None:
    geocoding.clear_cache()


@pytest.fixture
def provider(monkeypatch: pytest.MonkeyPatch) -> list[httpx.Request]:
    """Replace the outbound HTTP call with a mock transport and record requests."""
    calls: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        if request.url.params["q"] == "fail":
            return httpx.Response(503)
        return httpx.Response(200, json=NOMINATIM_RESPONSE)

    monkeypatch.setattr(geocoding, "transport", httpx.MockTransport(handler))
    return calls


async def test_geocode_proxies_and_caches(
    api: AsyncClient, db: AsyncSession, settings: Settings, provider: list[httpx.Request]
) -> None:
    headers = auth_headers(settings, await make_user(db, ADMIN_TG_ID))
    response = await api.get("/api/admin/geocode?q=My Khe&lang=ru", headers=headers)
    assert response.status_code == 200
    assert response.json() == [
        {
            "label": "My Khe Beach, Sơn Trà, Đà Nẵng",
            "latitude": 16.0612,
            "longitude": 108.2475,
            "kind": "beach",
        }
    ]
    request = provider[0]
    assert request.headers["User-Agent"] == settings.geocoding_user_agent
    assert request.url.params["accept-language"] == "ru"
    assert request.url.params["bounded"] == "1"
    assert request.url.params["countrycodes"] == "vn"

    again = await api.get("/api/admin/geocode?q=my khe &lang=ru", headers=headers)
    assert again.status_code == 200
    assert len(provider) == 1  # served from cache


async def test_geocode_provider_failure(
    api: AsyncClient, db: AsyncSession, settings: Settings, provider: list[httpx.Request]
) -> None:
    headers = auth_headers(settings, await make_user(db, ADMIN_TG_ID))
    response = await api.get("/api/admin/geocode?q=fail", headers=headers)
    assert response.status_code == 502
    assert response.json()["error"]["code"] == "geocoding_unavailable"


async def test_geocode_rate_limited(
    api: AsyncClient, db: AsyncSession, settings: Settings, provider: list[httpx.Request]
) -> None:
    settings.geocoding_rate_limit = "1/minute"
    headers = auth_headers(settings, await make_user(db, ADMIN_TG_ID))
    assert (await api.get("/api/admin/geocode?q=one", headers=headers)).status_code == 200
    assert (await api.get("/api/admin/geocode?q=two", headers=headers)).status_code == 429


async def test_geocode_admin_only(
    api: AsyncClient, db: AsyncSession, settings: Settings, provider: list[httpx.Request]
) -> None:
    headers = auth_headers(settings, await make_user(db, USER_TG_ID))
    assert (await api.get("/api/admin/geocode?q=x1", headers=headers)).status_code == 403
    assert provider == []
