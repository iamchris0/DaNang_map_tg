"""Amenities (catalog, validation, catalog filter) and the deposit as months of rent."""

import json
from pathlib import Path

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.amenities import AMENITY_CATEGORIES
from app.core.config import Settings
from app.models.enums import UserRole
from tests.conftest import ADMIN_TG_ID, requires_db
from tests.factories import auth_headers, make_apartment, make_user

CITY_BBOX = "107.80,15.85,108.40,16.25"
FRONTEND_CATALOG = (
    Path(__file__).resolve().parents[2] / "frontend/src/features/amenities/catalog.json"
)


@pytest.mark.skipif(not FRONTEND_CATALOG.exists(), reason="frontend sources not available")
def test_catalog_matches_the_frontend() -> None:
    frontend = json.loads(FRONTEND_CATALOG.read_text())
    assert [(group["category"], tuple(group["items"])) for group in frontend] == list(
        AMENITY_CATEGORIES.items()
    )


@pytest.fixture
async def admin(db: AsyncSession, settings: Settings) -> dict[str, str]:
    return auth_headers(settings, await make_user(db, ADMIN_TG_ID, role=UserRole.ADMIN))


@pytest.mark.db
@requires_db
async def test_amenities_are_validated_and_normalized(
    api: AsyncClient, admin: dict[str, str]
) -> None:
    created = await api.post(
        "/api/admin/apartments",
        json={
            "title": "Amenities",
            "amenities": ["pool", "wifi", "pool"],
            "custom_amenities": ["  Rooftop   BBQ ", "rooftop bbq", "", "Sauna"],
        },
        headers=admin,
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["amenities"] == ["wifi", "pool"]  # unique, in catalog order
    assert body["custom_amenities"] == ["Rooftop BBQ", "Sauna"]

    base = f"/api/admin/apartments/{body['id']}"
    bad_payloads = [
        {"amenities": ["wifi", "jacuzzi"]},
        {"custom_amenities": ["x" * 41]},
        {"custom_amenities": [f"Item {i}" for i in range(11)]},
    ]
    for payload in bad_payloads:
        response = await api.patch(base, json=payload, headers=admin)
        assert response.status_code == 422, payload

    cleared = await api.patch(base, json={"amenities": None}, headers=admin)
    assert cleared.json()["amenities"] == []


@pytest.mark.db
@requires_db
async def test_deposit_is_an_amount_or_months(api: AsyncClient, admin: dict[str, str]) -> None:
    created = await api.post(
        "/api/admin/apartments", json={"deposit_vnd": 10_000_000}, headers=admin
    )
    base = f"/api/admin/apartments/{created.json()['id']}"

    both = await api.patch(base, json={"deposit_vnd": 1, "deposit_months": 2}, headers=admin)
    assert both.status_code == 422
    out_of_range = await api.patch(base, json={"deposit_months": 13}, headers=admin)
    assert out_of_range.status_code == 422

    # Switching to months clears the amount, and back.
    months = (await api.patch(base, json={"deposit_months": 2}, headers=admin)).json()
    assert (months["deposit_vnd"], months["deposit_months"]) == (None, 2)
    amount = (await api.patch(base, json={"deposit_vnd": 5_000_000}, headers=admin)).json()
    assert (amount["deposit_vnd"], amount["deposit_months"]) == (5_000_000, None)


@pytest.mark.db
@requires_db
async def test_catalog_filters_by_all_selected_amenities(
    api: AsyncClient, db: AsyncSession
) -> None:
    pool = await make_apartment(
        db, title="Pool", amenities=["wifi", "pool"], custom_amenities=["Sauna"]
    )
    await make_apartment(db, title="Wifi only", amenities=["wifi"])
    await make_apartment(db, title="Nothing")

    async def titles(query: str) -> set[str]:
        response = await api.get(f"/api/apartments?page_size=50{query}")
        assert response.status_code == 200, response.text
        return {item["title"] for item in response.json()["items"]}

    assert await titles("&amenities=wifi") == {"Pool", "Wifi only"}
    assert await titles("&amenities=wifi&amenities=pool") == {"Pool"}
    assert await titles("") == {"Pool", "Wifi only", "Nothing"}
    unknown = await api.get("/api/apartments?amenities=jacuzzi")
    assert unknown.status_code == 422

    markers = await api.get(f"/api/apartments/map?bbox={CITY_BBOX}&amenities=pool")
    assert [m["id"] for m in markers.json()["markers"]] == [str(pool.id)]

    detail = (await api.get(f"/api/apartments/{pool.id}")).json()
    assert detail["amenities"] == ["wifi", "pool"]
    assert detail["custom_amenities"] == ["Sauna"]
    assert detail["deposit_months"] is None
