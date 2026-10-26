import uuid

import pytest
from httpx import AsyncClient, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.models import Apartment, TelegramPublication
from app.models.enums import ApartmentStatus, PublicationStatus
from tests.conftest import ADMIN_TG_ID, USER_TG_ID, requires_db
from tests.factories import BEACH, add_image, auth_headers, district_id, make_apartment, make_user

pytestmark = [pytest.mark.db, requires_db]

Headers = dict[str, str]


@pytest.fixture
async def admin(db: AsyncSession, settings: Settings) -> Headers:
    return auth_headers(settings, await make_user(db, ADMIN_TG_ID))


@pytest.fixture
async def regular(db: AsyncSession, settings: Settings) -> Headers:
    return auth_headers(settings, await make_user(db, USER_TG_ID))


ID = "00000000-0000-0000-0000-000000000001"
ADMIN_ENDPOINTS = [
    ("GET", "/api/admin/dashboard", None),
    ("GET", "/api/admin/apartments", None),
    ("POST", "/api/admin/apartments", {"title": "x"}),
    ("GET", f"/api/admin/apartments/{ID}", None),
    ("PATCH", f"/api/admin/apartments/{ID}", {"title": "x"}),
    ("PATCH", f"/api/admin/apartments/{ID}/status", {"status": "available"}),
    ("DELETE", f"/api/admin/apartments/{ID}", None),
]


@pytest.mark.parametrize(("method", "url", "body"), ADMIN_ENDPOINTS)
async def test_admin_endpoints_require_auth(
    api: AsyncClient, method: str, url: str, body: object
) -> None:
    response = await api.request(method, url, json=body)
    assert response.status_code == 401


@pytest.mark.parametrize(("method", "url", "body"), ADMIN_ENDPOINTS)
async def test_admin_endpoints_reject_regular_users(
    api: AsyncClient, regular: Headers, method: str, url: str, body: object
) -> None:
    response = await api.request(method, url, json=body, headers=regular)
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "forbidden"


async def test_admin_rights_revoked_by_config(
    api: AsyncClient, admin: Headers, settings: Settings
) -> None:
    assert (await api.get("/api/admin/dashboard", headers=admin)).status_code == 200
    settings.admin_telegram_user_ids = frozenset()
    assert (await api.get("/api/admin/dashboard", headers=admin)).status_code == 403


async def test_create_minimal_draft(api: AsyncClient, admin: Headers) -> None:
    response = await api.post("/api/admin/apartments", json={"title": "  WIP  "}, headers=admin)
    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "draft"
    assert body["title"] == "WIP"
    assert body["images"] == []
    assert body["latest_publication"] is None
    assert set(body["missing_fields"]) == {
        "price_vnd",
        "district_id",
        "bedrooms",
        "latitude",
        "longitude",
        "location_precision",
        "images",
    }


async def test_create_full_listing(api: AsyncClient, admin: Headers, db: AsyncSession) -> None:
    payload = {
        "title": "Sea view 1BR",
        "description": "Bright apartment",
        "price_vnd": 12_000_000,
        "area_sqm": "45.5",
        "bedrooms": 1,
        "bathrooms": 1,
        "district_id": await district_id(db),
        "address": "An Thuong 2",
        "latitude": BEACH[0],
        "longitude": BEACH[1],
        "location_precision": "approximate",
        "deposit_vnd": 12_000_000,
        "minimum_rental_months": 6,
        "rental_conditions": "No smoking",
        "agent_contact_type": "telegram_username",
        "agent_contact_value": "@agent_minh",
    }
    body = (await api.post("/api/admin/apartments", json=payload, headers=admin)).json()
    assert body["agent_contact_value"] == "agent_minh"
    assert body["district"]["slug"] == "son-tra"
    assert body["area_sqm"] == "45.5"
    assert body["missing_fields"] == ["images"]


@pytest.mark.parametrize(
    ("payload", "code"),
    [
        ({"district_id": 9999}, "invalid_district"),
        ({"latitude": 21.03, "longitude": 105.85}, "location_out_of_service_area"),  # Hanoi
        ({"price_vnd": -5}, "validation_error"),
        ({"agent_contact_type": "telegram_link", "agent_contact_value": "https://x.y"}, None),
    ],
)
async def test_create_rejects_invalid(
    api: AsyncClient, admin: Headers, payload: dict[str, object], code: str | None
) -> None:
    response = await api.post("/api/admin/apartments", json=payload, headers=admin)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == (code or "validation_error")


async def test_inactive_district_rejected(
    api: AsyncClient, admin: Headers, db: AsyncSession
) -> None:
    from app.models import District

    district = await db.get(District, await district_id(db, "hoa-vang"))
    assert district is not None
    district.active = False
    await db.commit()
    response = await api.post(
        "/api/admin/apartments", json={"district_id": district.id}, headers=admin
    )
    assert response.json()["error"]["code"] == "invalid_district"


async def test_get_includes_drafts_and_404s(
    api: AsyncClient, admin: Headers, db: AsyncSession
) -> None:
    draft = await make_apartment(db, status=ApartmentStatus.DRAFT, title=None)
    assert (await api.get(f"/api/admin/apartments/{draft.id}", headers=admin)).status_code == 200
    missing = await api.get(f"/api/admin/apartments/{uuid.uuid4()}", headers=admin)
    assert missing.status_code == 404
    assert missing.json()["error"]["code"] == "listing_not_found"


async def test_patch_updates_only_sent_fields(
    api: AsyncClient, admin: Headers, db: AsyncSession
) -> None:
    apartment = await make_apartment(db, description="Original")
    response = await api.patch(
        f"/api/admin/apartments/{apartment.id}",
        json={"price_vnd": 15_000_000, "address": None},
        headers=admin,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["price_vnd"] == 15_000_000
    assert body["description"] == "Original"
    assert body["address"] is None


async def test_patch_cannot_break_published_listing(
    api: AsyncClient, admin: Headers, db: AsyncSession
) -> None:
    apartment = await make_apartment(db)
    response = await api.patch(
        f"/api/admin/apartments/{apartment.id}", json={"price_vnd": None}, headers=admin
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "listing_incomplete"
    assert response.json()["error"]["details"] == {"missing_fields": ["price_vnd"]}
    await db.refresh(apartment)
    assert apartment.price_vnd == 12_000_000


async def test_draft_can_be_left_incomplete(
    api: AsyncClient, admin: Headers, db: AsyncSession
) -> None:
    draft = await make_apartment(db, status=ApartmentStatus.DRAFT)
    response = await api.patch(
        f"/api/admin/apartments/{draft.id}", json={"price_vnd": None}, headers=admin
    )
    assert response.status_code == 200


async def _set_status(
    api: AsyncClient, admin: Headers, apartment_id: object, status: str
) -> Response:
    return await api.patch(
        f"/api/admin/apartments/{apartment_id}/status", json={"status": status}, headers=admin
    )


async def test_publish_requires_complete_listing_with_photo(
    api: AsyncClient, admin: Headers, db: AsyncSession
) -> None:
    draft = await make_apartment(db, status=ApartmentStatus.DRAFT, with_image=False, bedrooms=None)
    draft_id = draft.id  # the service's rollback expires ORM objects in the shared test session
    response = await _set_status(api, admin, draft_id, "available")
    assert response.status_code == 422
    assert response.json()["error"]["details"] == {"missing_fields": ["bedrooms", "images"]}

    await api.patch(f"/api/admin/apartments/{draft_id}", json={"bedrooms": 0}, headers=admin)
    await add_image(db, draft_id)
    response = await _set_status(api, admin, draft_id, "available")
    assert response.status_code == 200
    assert response.json()["status"] == "available"
    assert response.json()["missing_fields"] == []


async def test_full_lifecycle(api: AsyncClient, admin: Headers, db: AsyncSession) -> None:
    apartment = await make_apartment(db, status=ApartmentStatus.DRAFT)
    for target in ["available", "rented", "available", "archived", "available"]:
        response = await _set_status(api, admin, apartment.id, target)
        assert response.status_code == 200, (target, response.text)
        assert response.json()["status"] == target


@pytest.mark.parametrize(
    ("start", "target"),
    [
        (ApartmentStatus.DRAFT, "rented"),
        (ApartmentStatus.ARCHIVED, "rented"),
        (ApartmentStatus.AVAILABLE, "draft"),
        (ApartmentStatus.RENTED, "draft"),
    ],
)
async def test_invalid_transitions(
    api: AsyncClient, admin: Headers, db: AsyncSession, start: ApartmentStatus, target: str
) -> None:
    apartment = await make_apartment(db, status=start)
    response = await _set_status(api, admin, apartment.id, target)
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "invalid_status_transition"


async def test_same_status_is_noop(api: AsyncClient, admin: Headers, db: AsyncSession) -> None:
    apartment = await make_apartment(db)
    assert (await _set_status(api, admin, apartment.id, "available")).status_code == 200


async def test_soft_delete(api: AsyncClient, admin: Headers, db: AsyncSession) -> None:
    apartment = await make_apartment(db)
    response = await api.delete(f"/api/admin/apartments/{apartment.id}", headers=admin)
    assert response.status_code == 204
    await db.refresh(apartment)
    assert apartment.deleted_at is not None
    assert (
        await api.get(f"/api/admin/apartments/{apartment.id}", headers=admin)
    ).status_code == 404
    again = await api.delete(f"/api/admin/apartments/{apartment.id}", headers=admin)
    assert again.status_code == 404
    listing = (await api.get("/api/admin/apartments", headers=admin)).json()
    assert str(apartment.id) not in {item["id"] for item in listing["items"]}


async def test_admin_list_search_filter_and_publication_status(
    api: AsyncClient, admin: Headers, db: AsyncSession
) -> None:
    beach = await make_apartment(db, title="Beach studio 100%")
    await make_apartment(db, title="City loft", status=ApartmentStatus.RENTED)
    await make_apartment(db, title=None, status=ApartmentStatus.DRAFT)
    db.add(
        TelegramPublication(
            apartment_id=beach.id,
            telegram_channel_id="-100123",
            status=PublicationStatus.SUCCEEDED,
            idempotency_key="k1",
            telegram_message_id=77,
        )
    )
    await db.commit()

    all_items = (await api.get("/api/admin/apartments", headers=admin)).json()
    assert all_items["total"] == 3

    found = (await api.get("/api/admin/apartments?q=BEACH", headers=admin)).json()
    assert [item["title"] for item in found["items"]] == ["Beach studio 100%"]
    assert found["items"][0]["publication_status"] == "succeeded"
    assert found["items"][0]["cover_image"]["url"].startswith("https://img.example.test/")

    # LIKE wildcards in the search term are literal.
    assert (await api.get("/api/admin/apartments?q=%25", headers=admin)).json()["total"] == 1

    rented = (await api.get("/api/admin/apartments?status=rented", headers=admin)).json()
    assert [item["title"] for item in rented["items"]] == ["City loft"]


async def test_admin_list_pagination(api: AsyncClient, admin: Headers, db: AsyncSession) -> None:
    for i in range(5):
        await make_apartment(db, title=f"Listing {i}")
    page = (await api.get("/api/admin/apartments?page=2&page_size=2", headers=admin)).json()
    assert page["total"] == 5
    assert page["page"] == 2
    assert len(page["items"]) == 2


async def test_dashboard_counts(api: AsyncClient, admin: Headers, db: AsyncSession) -> None:
    await make_apartment(db)
    await make_apartment(db)
    await make_apartment(db, status=ApartmentStatus.DRAFT)
    await make_apartment(db, status=ApartmentStatus.RENTED)
    await make_apartment(db, status=ApartmentStatus.ARCHIVED)
    deleted: Apartment = await make_apartment(db)
    await api.delete(f"/api/admin/apartments/{deleted.id}", headers=admin)

    body = (await api.get("/api/admin/dashboard", headers=admin)).json()
    assert body == {"total": 5, "available": 2, "draft": 1, "rented": 1, "archived": 1}


async def test_admin_write_rate_limited(
    api: AsyncClient, admin: Headers, settings: Settings
) -> None:
    settings.rate_limit_admin_write = "2/minute"
    codes = [
        (await api.post("/api/admin/apartments", json={}, headers=admin)).status_code
        for _ in range(3)
    ]
    assert codes == [201, 201, 429]
