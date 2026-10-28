"""Convert ORM objects to response schemas. Keeps URL building and field selection in one place,
so public responses can never accidentally include administrative fields."""

from typing import Any

from app.core.config import Settings
from app.core.contacts import contact_url
from app.core.media import image_url, listing_share_url
from app.models import Apartment, ApartmentImage, District, TelegramPublication
from app.models.enums import ContactType, PublicationStatus
from app.schemas.apartment import (
    AdminApartmentListItem,
    AdminApartmentOut,
    ContactOut,
    MapMarker,
    PublicApartmentCard,
    PublicApartmentDetail,
    PublicationSummary,
)
from app.schemas.common import DistrictOut, ImageOut
from app.services.images import variant_key


def _present[T](value: T | None, name: str) -> T:
    # Public listings are guaranteed complete by ck_apartments_publishable_fields.
    if value is None:
        raise RuntimeError(f"Public listing is missing required field {name}")
    return value


def image_out(settings: Settings, image: ApartmentImage) -> ImageOut:
    return ImageOut(
        id=image.id,
        url=image_url(settings, variant_key(image.storage_key, "lg")),
        thumb_url=image_url(settings, variant_key(image.storage_key, "sm")),
        width=image.width,
        height=image.height,
    )


def _district(district: District | None) -> DistrictOut | None:
    return DistrictOut.model_validate(district) if district else None


def _cover(settings: Settings, apartment: Apartment) -> ImageOut | None:
    return image_out(settings, apartment.cover_image) if apartment.cover_image else None


def admin_detail(
    settings: Settings,
    apartment: Apartment,
    missing_fields: list[str],
    publication: TelegramPublication | None,
) -> AdminApartmentOut:
    return AdminApartmentOut(
        id=apartment.id,
        status=apartment.status,
        title=apartment.title,
        description=apartment.description,
        price_vnd=apartment.price_vnd,
        area_sqm=apartment.area_sqm,
        bedrooms=apartment.bedrooms,
        bathrooms=apartment.bathrooms,
        district=_district(apartment.district),
        address=apartment.address,
        latitude=apartment.latitude,
        longitude=apartment.longitude,
        location_precision=apartment.location_precision,
        deposit_vnd=apartment.deposit_vnd,
        deposit_months=apartment.deposit_months,
        minimum_rental_months=apartment.minimum_rental_months,
        rental_conditions=apartment.rental_conditions,
        amenities=list(apartment.amenities or []),
        custom_amenities=list(apartment.custom_amenities or []),
        agent_contact_type=apartment.agent_contact_type,
        agent_contact_value=apartment.agent_contact_value,
        images=[image_out(settings, image) for image in apartment.images],
        created_at=apartment.created_at,
        updated_at=apartment.updated_at,
        missing_fields=missing_fields,
        latest_publication=PublicationSummary.model_validate(publication) if publication else None,
    )


def admin_list_item(
    settings: Settings, apartment: Apartment, publication_status: PublicationStatus | None
) -> AdminApartmentListItem:
    return AdminApartmentListItem(
        id=apartment.id,
        status=apartment.status,
        title=apartment.title,
        price_vnd=apartment.price_vnd,
        district=_district(apartment.district),
        cover_image=_cover(settings, apartment),
        updated_at=apartment.updated_at,
        publication_status=publication_status,
    )


def _card_fields(settings: Settings, apartment: Apartment) -> dict[str, Any]:
    return {
        "id": apartment.id,
        "title": _present(apartment.title, "title"),
        "price_vnd": _present(apartment.price_vnd, "price_vnd"),
        "district": DistrictOut.model_validate(_present(apartment.district, "district")),
        "area_sqm": apartment.area_sqm,
        "bedrooms": _present(apartment.bedrooms, "bedrooms"),
        "bathrooms": apartment.bathrooms,
        "location_precision": _present(apartment.location_precision, "location_precision"),
        "cover_image": _cover(settings, apartment),
        "updated_at": apartment.updated_at,
    }


def public_card(settings: Settings, apartment: Apartment) -> PublicApartmentCard:
    return PublicApartmentCard(**_card_fields(settings, apartment))


def public_detail(settings: Settings, apartment: Apartment) -> PublicApartmentDetail:
    agent_contact = None
    if apartment.agent_contact_type and apartment.agent_contact_value:
        agent_contact = ContactOut(
            type=apartment.agent_contact_type,
            value=apartment.agent_contact_value,
            url=contact_url(apartment.agent_contact_type, apartment.agent_contact_value),
        )
    admin_contact = None
    if settings.admin_contact_telegram:
        username = settings.admin_contact_telegram.removeprefix("@")
        admin_contact = ContactOut(
            type=ContactType.TELEGRAM_USERNAME,
            value=username,
            url=contact_url(ContactType.TELEGRAM_USERNAME, username),
        )
    return PublicApartmentDetail(
        **_card_fields(settings, apartment),
        description=apartment.description,
        address=apartment.address,
        latitude=_present(apartment.latitude, "latitude"),
        longitude=_present(apartment.longitude, "longitude"),
        deposit_vnd=apartment.deposit_vnd,
        deposit_months=apartment.deposit_months,
        minimum_rental_months=apartment.minimum_rental_months,
        rental_conditions=apartment.rental_conditions,
        amenities=list(apartment.amenities or []),
        custom_amenities=list(apartment.custom_amenities or []),
        images=[image_out(settings, image) for image in apartment.images],
        agent_contact=agent_contact,
        admin_contact=admin_contact,
        share_url=listing_share_url(settings, str(apartment.id)),
    )


def map_marker(row: Any) -> MapMarker:
    return MapMarker(
        id=row.id,
        latitude=row.latitude,
        longitude=row.longitude,
        price_vnd=row.price_vnd,
        bedrooms=row.bedrooms,
        location_precision=row.location_precision,
    )
