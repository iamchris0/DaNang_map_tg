import uuid
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import ApartmentStatus, ContactType, LocationPrecision
from app.services import catalog
from tests.conftest import requires_db
from tests.factories import add_image, district_id, make_apartment

pytestmark = [pytest.mark.db, requires_db]

# Rough viewports: Son Tra beach area vs. Hai Chau centre.
BEACH_BBOX = "108.23,16.04,108.26,16.08"
CENTER = (16.0678, 108.2208)
CITY_BBOX = "107.80,15.85,108.40,16.25"


async def _ids(api: AsyncClient, query: str = "") -> set[str]:
    response = await api.get(f"/api/apartments?page_size=50{query}")
    assert response.status_code == 200, response.text
    return {item["id"] for item in response.json()["items"]}


async def test_only_available_listings_are_public(api: AsyncClient, db: AsyncSession) -> None:
    visible = await make_apartment(db)
    hidden = [
        await make_apartment(db, status=ApartmentStatus.DRAFT),
        await make_apartment(db, status=ApartmentStatus.RENTED),
        await make_apartment(db, status=ApartmentStatus.ARCHIVED),
    ]
    deleted = await make_apartment(db)
    deleted.deleted_at = deleted.created_at
    await db.commit()

    assert await _ids(api) == {str(visible.id)}
    markers = (await api.get(f"/api/apartments/map?bbox={CITY_BBOX}")).json()
    assert {m["id"] for m in markers["markers"]} == {str(visible.id)}
    for apartment in [*hidden, deleted]:
        assert (await api.get(f"/api/apartments/{apartment.id}")).status_code in {404, 410}


@pytest.mark.parametrize(
    ("status", "http_status", "code"),
    [
        (ApartmentStatus.DRAFT, 404, "listing_not_found"),
        (ApartmentStatus.RENTED, 410, "listing_unavailable"),
        (ApartmentStatus.ARCHIVED, 410, "listing_unavailable"),
    ],
)
async def test_detail_for_non_public_listing(
    api: AsyncClient, db: AsyncSession, status: ApartmentStatus, http_status: int, code: str
) -> None:
    apartment = await make_apartment(db, status=status, title="Secret draft title")
    response = await api.get(f"/api/apartments/{apartment.id}")
    assert response.status_code == http_status
    assert response.json()["error"]["code"] == code
    assert "Secret" not in response.text


@pytest.mark.parametrize("path", [str(uuid.uuid4()), "not-a-uuid"])
async def test_detail_unknown_ids(api: AsyncClient, path: str) -> None:
    response = await api.get(f"/api/apartments/{path}")
    assert response.status_code in {404, 422}


async def test_detail_payload(api: AsyncClient, db: AsyncSession) -> None:
    apartment = await make_apartment(
        db,
        description="Bright and quiet",
        deposit_vnd=12_000_000,
        minimum_rental_months=6,
        agent_contact_type=ContactType.TELEGRAM_USERNAME,
        agent_contact_value="agent_minh",
        location_precision=LocationPrecision.APPROXIMATE,
    )
    await add_image(db, apartment.id, sort_order=1)

    response = await api.get(f"/api/apartments/{apartment.id}")
    assert response.status_code == 200
    body: dict[str, Any] = response.json()
    assert body["title"] == "Sea view 1BR"
    assert body["district"]["name_en"] == "Sơn Trà"
    assert body["location_precision"] == "approximate"
    assert len(body["images"]) == 2
    assert body["cover_image"]["id"] == body["images"][0]["id"]
    assert body["agent_contact"] == {
        "type": "telegram_username",
        "value": "agent_minh",
        "url": "https://t.me/agent_minh",
    }
    assert body["admin_contact"]["url"] == "https://t.me/danang_admin"
    assert body["share_url"] == f"https://t.me/DaNangAptBot/app?startapp={apartment.id}"
    # No administrative metadata in public responses.
    for field in ("status", "created_by", "deleted_at", "missing_fields", "latest_publication"):
        assert field not in body


async def test_missing_agent_contact_keeps_admin_contact(
    api: AsyncClient, db: AsyncSession
) -> None:
    apartment = await make_apartment(db)
    body = (await api.get(f"/api/apartments/{apartment.id}")).json()
    assert body["agent_contact"] is None
    assert body["admin_contact"] is not None


async def test_price_filters(api: AsyncClient, db: AsyncSession) -> None:
    cheap = await make_apartment(db, price_vnd=6_000_000)
    mid = await make_apartment(db, price_vnd=12_000_000)
    pricey = await make_apartment(db, price_vnd=25_000_000)
    assert await _ids(api, "&min_price=10000000") == {str(mid.id), str(pricey.id)}
    assert await _ids(api, "&max_price=12000000") == {str(cheap.id), str(mid.id)}
    assert await _ids(api, "&min_price=7000000&max_price=20000000") == {str(mid.id)}


async def test_bedroom_filters_including_studio_and_3_plus(
    api: AsyncClient, db: AsyncSession
) -> None:
    by_bedrooms = {n: await make_apartment(db, bedrooms=n) for n in (0, 1, 2, 3, 4)}
    assert await _ids(api, "&bedrooms=0") == {str(by_bedrooms[0].id)}
    assert await _ids(api, "&bedrooms=3") == {str(by_bedrooms[3].id), str(by_bedrooms[4].id)}
    assert await _ids(api, "&bedrooms=0&bedrooms=2") == {
        str(by_bedrooms[0].id),
        str(by_bedrooms[2].id),
    }


async def test_district_and_area_filters_combined(api: AsyncClient, db: AsyncSession) -> None:
    small_son_tra = await make_apartment(db, area_sqm=30)
    big_son_tra = await make_apartment(db, area_sqm=80)
    big_hai_chau = await make_apartment(
        db, area_sqm=80, district="hai-chau", latitude=CENTER[0], longitude=CENTER[1]
    )
    no_area = await make_apartment(db, area_sqm=None)
    son_tra = await district_id(db, "son-tra")
    hai_chau = await district_id(db, "hai-chau")

    assert await _ids(api, f"&district={son_tra}") == {
        str(small_son_tra.id),
        str(big_son_tra.id),
        str(no_area.id),
    }
    assert await _ids(api, f"&district={son_tra}&district={hai_chau}&min_area=50") == {
        str(big_son_tra.id),
        str(big_hai_chau.id),
    }
    assert await _ids(api, f"&district={son_tra}&min_area=20&max_area=40") == {
        str(small_son_tra.id)
    }


async def test_all_filters_combined(api: AsyncClient, db: AsyncSession) -> None:
    match = await make_apartment(db, price_vnd=10_000_000, bedrooms=2, area_sqm=60)
    await make_apartment(db, price_vnd=10_000_000, bedrooms=1, area_sqm=60)
    await make_apartment(db, price_vnd=30_000_000, bedrooms=2, area_sqm=60)
    await make_apartment(db, price_vnd=10_000_000, bedrooms=2, area_sqm=20)
    son_tra = await district_id(db, "son-tra")
    query = (
        f"&min_price=5000000&max_price=15000000&bedrooms=2&district={son_tra}"
        f"&min_area=50&max_area=100&bbox={BEACH_BBOX}"
    )
    assert await _ids(api, query) == {str(match.id)}
    response = await api.get(f"/api/apartments/map?{query.lstrip('&')}")
    assert [m["id"] for m in response.json()["markers"]] == [str(match.id)]


async def test_map_bbox_filtering(api: AsyncClient, db: AsyncSession) -> None:
    beach = await make_apartment(db, price_vnd=8_500_000)
    await make_apartment(db, district="hai-chau", latitude=CENTER[0], longitude=CENTER[1])

    response = await api.get(f"/api/apartments/map?bbox={BEACH_BBOX}")
    assert response.status_code == 200
    assert response.json() == {
        "markers": [
            {
                "id": str(beach.id),
                "latitude": beach.latitude,
                "longitude": beach.longitude,
                "price_vnd": 8_500_000,
                "bedrooms": 1,
                "location_precision": "exact",
            }
        ],
        "total": 1,
        "truncated": False,
    }
    assert len((await api.get(f"/api/apartments/map?bbox={CITY_BBOX}")).json()["markers"]) == 2


async def test_map_requires_valid_bbox(api: AsyncClient) -> None:
    missing = await api.get("/api/apartments/map")
    assert missing.status_code == 422
    assert missing.json()["error"]["details"][0]["loc"] == ["query", "bbox"]
    assert (await api.get("/api/apartments/map?bbox=1,2,3")).status_code == 422


async def test_map_truncates_large_results(
    api: AsyncClient, db: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(catalog, "MAP_MARKER_LIMIT", 2)
    for _ in range(3):
        await make_apartment(db)
    body = (await api.get(f"/api/apartments/map?bbox={CITY_BBOX}")).json()
    assert len(body["markers"]) == 2
    assert body["total"] == 3
    assert body["truncated"] is True


async def test_list_pagination_and_sorting(api: AsyncClient, db: AsyncSession) -> None:
    prices = [9_000_000, 5_000_000, 15_000_000, 7_000_000]
    for price in prices:
        await make_apartment(db, price_vnd=price)

    first = (await api.get("/api/apartments?sort=price_asc&page_size=3")).json()
    assert first["total"] == 4
    assert [item["price_vnd"] for item in first["items"]] == sorted(prices)[:3]
    second = (await api.get("/api/apartments?sort=price_asc&page_size=3&page=2")).json()
    assert [item["price_vnd"] for item in second["items"]] == [15_000_000]

    desc = (await api.get("/api/apartments?sort=price_desc")).json()
    assert desc["items"][0]["price_vnd"] == 15_000_000
    card = desc["items"][0]
    assert set(card) == {
        "id",
        "title",
        "price_vnd",
        "district",
        "area_sqm",
        "bedrooms",
        "bathrooms",
        "location_precision",
        "cover_image",
        "updated_at",
    }


@pytest.mark.parametrize(
    "query",
    ["min_price=10&max_price=5", "bedrooms=7", "page=0", "page_size=500", "sort=random"],
)
async def test_invalid_list_queries(api: AsyncClient, query: str) -> None:
    response = await api.get(f"/api/apartments?{query}")
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


async def test_districts(api: AsyncClient) -> None:
    response = await api.get("/api/districts")
    assert response.status_code == 200
    slugs = [district["slug"] for district in response.json()]
    assert len(slugs) == 7
    assert "son-tra" in slugs
    assert set(response.json()[0]) == {"id", "slug", "name_en", "name_ru"}


async def test_public_catalog_needs_no_auth_but_rented_disappears(
    api: AsyncClient, db: AsyncSession
) -> None:
    apartment = await make_apartment(db)
    assert str(apartment.id) in await _ids(api)
    apartment.status = ApartmentStatus.RENTED
    await db.commit()
    assert str(apartment.id) not in await _ids(api)
