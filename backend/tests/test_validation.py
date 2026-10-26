"""Unit tests for contact normalisation, listing schemas and catalog query parsing."""

import pytest
from pydantic import ValidationError

from app.api.errors import AppError
from app.core.contacts import ContactError, contact_url, normalize_contact
from app.models.enums import ContactType
from app.schemas.apartment import ApartmentCreate, ApartmentUpdate
from app.schemas.catalog import BBox, catalog_filters

T_USER, T_LINK, PHONE = ContactType.TELEGRAM_USERNAME, ContactType.TELEGRAM_LINK, ContactType.PHONE


@pytest.mark.parametrize(
    ("contact_type", "raw", "expected"),
    [
        (T_USER, "@Agent_Minh", "Agent_Minh"),
        (T_USER, "  agent_minh ", "agent_minh"),
        (T_LINK, "https://t.me/agent_minh", "https://t.me/agent_minh"),
        (T_LINK, "t.me/agent_minh/", "https://t.me/agent_minh"),
        (T_LINK, "http://telegram.me/agent_minh", "https://t.me/agent_minh"),
        (T_LINK, "tg://resolve?domain=agent_minh", "https://t.me/agent_minh"),
        (T_LINK, "https://t.me/+84905123456", "https://t.me/+84905123456"),
        (PHONE, "+84 905 123 456", "+84905123456"),
        (PHONE, "(0905) 123-456", "0905123456"),
    ],
)
def test_contact_normalisation(contact_type: ContactType, raw: str, expected: str) -> None:
    assert normalize_contact(contact_type, raw) == expected


@pytest.mark.parametrize(
    ("contact_type", "raw"),
    [
        (T_USER, "ab"),
        (T_USER, "1startswithdigit"),
        (T_USER, "has space"),
        (T_LINK, "https://evil.example/agent"),
        (T_LINK, "javascript:alert(1)"),
        (T_LINK, "https://t.me/+AbCdInviteHash"),
        (PHONE, "call me"),
        (PHONE, "123"),
    ],
)
def test_contact_rejected(contact_type: ContactType, raw: str) -> None:
    with pytest.raises(ContactError):
        normalize_contact(contact_type, raw)


def test_contact_urls() -> None:
    assert contact_url(T_USER, "agent_minh") == "https://t.me/agent_minh"
    assert contact_url(PHONE, "0905123456") == "tel:+0905123456"
    assert contact_url(PHONE, "+84905123456") == "tel:+84905123456"


def test_create_normalises_contact() -> None:
    data = ApartmentCreate(agent_contact_type=T_USER, agent_contact_value="@minh_agent")
    assert data.agent_contact_value == "minh_agent"


@pytest.mark.parametrize(
    "payload",
    [
        {"latitude": 16.0},
        {"longitude": 108.2},
        {"latitude": 16.0, "longitude": None},
        {"agent_contact_type": "telegram_username"},
        {"agent_contact_type": "telegram_username", "agent_contact_value": "x"},
        {"price_vnd": 0},
        {"bedrooms": -1},
        {"area_sqm": "45.25"},
        {"title": "   "},
        {"latitude": 91, "longitude": 108},
    ],
)
def test_invalid_listing_payloads(payload: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        ApartmentUpdate.model_validate(payload)


def test_update_tracks_only_sent_fields() -> None:
    data = ApartmentUpdate.model_validate({"title": "New", "description": None})
    assert data.model_dump(exclude_unset=True) == {"title": "New", "description": None}


def test_clearing_paired_fields_together_is_allowed() -> None:
    data = ApartmentUpdate.model_validate({"latitude": None, "longitude": None})
    assert data.model_dump(exclude_unset=True) == {"latitude": None, "longitude": None}


def test_bbox_parse() -> None:
    assert BBox.parse("108.1,15.9,108.3,16.1") == BBox(108.1, 15.9, 108.3, 16.1)


@pytest.mark.parametrize("raw", ["1,2,3", "a,b,c,d", "108.3,15.9,108.1,16.1", "0,95,1,96"])
def test_bbox_invalid(raw: str) -> None:
    with pytest.raises(AppError):
        BBox.parse(raw)


@pytest.mark.parametrize(
    "kwargs",
    [
        {"min_price": 10, "max_price": 5},
        {"min_area": 50, "max_area": 40},
        {"bedrooms": [4]},
        {"district": list(range(25))},
    ],
)
def test_catalog_filters_invalid(kwargs: dict[str, object]) -> None:
    with pytest.raises(AppError) as exc_info:
        catalog_filters(**kwargs)  # type: ignore[arg-type]
    assert exc_info.value.status_code == 422
