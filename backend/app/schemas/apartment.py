import uuid
from datetime import datetime
from decimal import Decimal
from typing import Annotated, Self

from pydantic import Field, StringConstraints, field_validator, model_validator

from app.core.amenities import (
    CUSTOM_AMENITY_MAX_LENGTH,
    MAX_CUSTOM_AMENITIES,
    UnknownAmenityError,
    normalize_amenities,
    normalize_custom_amenities,
)
from app.core.contacts import ContactError, normalize_contact
from app.models.enums import ApartmentStatus, ContactType, LocationPrecision, PublicationStatus
from app.schemas.common import DistrictOut, ImageOut, Schema

MAX_VND = 100_000_000_000  # 100 billion VND; far above any monthly rent

Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
LongText = Annotated[str, StringConstraints(strip_whitespace=True, max_length=5000)]
Address = Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)]
CustomAmenity = Annotated[str, StringConstraints(max_length=CUSTOM_AMENITY_MAX_LENGTH)]
ContactValue = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=256)
]


class ApartmentFields(Schema):
    """Every editable listing attribute. All optional so incomplete drafts can be saved."""

    title: Title | None = None
    description: LongText | None = None
    price_vnd: int | None = Field(default=None, gt=0, le=MAX_VND)
    area_sqm: Decimal | None = Field(default=None, gt=0, le=10_000, decimal_places=1)
    bedrooms: int | None = Field(default=None, ge=0, le=20, description="0 = studio")
    bathrooms: int | None = Field(default=None, ge=0, le=20)
    district_id: int | None = Field(default=None, gt=0)
    address: Address | None = None
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    location_precision: LocationPrecision | None = None
    # A fixed amount or a number of months' rent, not both.
    deposit_vnd: int | None = Field(default=None, ge=0, le=MAX_VND)
    deposit_months: int | None = Field(default=None, ge=1, le=12)
    minimum_rental_months: int | None = Field(default=None, ge=1, le=120)
    rental_conditions: LongText | None = None
    # Keys from app.core.amenities; null clears the list.
    amenities: list[str] | None = Field(default=None, max_length=100)
    custom_amenities: list[CustomAmenity] | None = Field(
        default=None, max_length=MAX_CUSTOM_AMENITIES
    )
    agent_contact_type: ContactType | None = None
    agent_contact_value: ContactValue | None = None

    @field_validator("amenities")
    @classmethod
    def _known_amenities(cls, value: list[str] | None) -> list[str]:
        try:
            return normalize_amenities(value or [])
        except UnknownAmenityError as exc:
            raise ValueError(str(exc)) from exc

    @field_validator("custom_amenities")
    @classmethod
    def _clean_custom_amenities(cls, value: list[str] | None) -> list[str]:
        return normalize_custom_amenities(value or [])

    @model_validator(mode="after")
    def _check_pairs(self) -> Self:
        if self.deposit_vnd is not None and self.deposit_months is not None:
            raise ValueError("Give the deposit as an amount or in months, not both")
        # For PATCH payloads only the fields actually sent are compared.
        sent = self.model_fields_set
        for first, second in (
            ("latitude", "longitude"),
            ("agent_contact_type", "agent_contact_value"),
        ):
            if (first in sent or second in sent) and (
                (first in sent) != (second in sent)
                or (getattr(self, first) is None) != (getattr(self, second) is None)
            ):
                raise ValueError(f"{first} and {second} must be provided together")
        if self.agent_contact_type is not None and self.agent_contact_value is not None:
            try:
                self.agent_contact_value = normalize_contact(
                    self.agent_contact_type, self.agent_contact_value
                )
            except ContactError as exc:
                raise ValueError(str(exc)) from exc
        return self


class ApartmentCreate(ApartmentFields):
    pass


class ApartmentUpdate(ApartmentFields):
    pass


class StatusUpdate(Schema):
    status: ApartmentStatus


class PublicationSummary(Schema):
    status: PublicationStatus
    telegram_message_id: int | None
    published_at: datetime | None
    created_at: datetime


class AdminApartmentOut(Schema):
    id: uuid.UUID
    status: ApartmentStatus
    title: str | None
    description: str | None
    price_vnd: int | None
    area_sqm: Decimal | None
    bedrooms: int | None
    bathrooms: int | None
    district: DistrictOut | None
    address: str | None
    latitude: float | None
    longitude: float | None
    location_precision: LocationPrecision | None
    deposit_vnd: int | None
    deposit_months: int | None
    minimum_rental_months: int | None
    rental_conditions: str | None
    amenities: list[str]
    custom_amenities: list[str]
    agent_contact_type: ContactType | None
    agent_contact_value: str | None
    images: list[ImageOut]
    created_at: datetime
    updated_at: datetime
    # Required fields still missing before the listing can be made available.
    missing_fields: list[str]
    latest_publication: PublicationSummary | None


class AdminApartmentListItem(Schema):
    id: uuid.UUID
    status: ApartmentStatus
    title: str | None
    price_vnd: int | None
    district: DistrictOut | None
    cover_image: ImageOut | None
    updated_at: datetime
    publication_status: PublicationStatus | None


class DashboardOut(Schema):
    total: int
    available: int
    draft: int
    rented: int
    archived: int


class PublicApartmentCard(Schema):
    id: uuid.UUID
    title: str
    price_vnd: int
    district: DistrictOut
    area_sqm: Decimal | None
    bedrooms: int
    bathrooms: int | None
    location_precision: LocationPrecision
    cover_image: ImageOut | None
    updated_at: datetime


class ContactOut(Schema):
    type: ContactType
    value: str
    url: str


class PublicApartmentDetail(PublicApartmentCard):
    description: str | None
    address: str | None
    latitude: float
    longitude: float
    deposit_vnd: int | None
    deposit_months: int | None
    minimum_rental_months: int | None
    rental_conditions: str | None
    amenities: list[str]
    custom_amenities: list[str]
    images: list[ImageOut]
    agent_contact: ContactOut | None
    admin_contact: ContactOut | None
    share_url: str


class MapMarker(Schema):
    id: uuid.UUID
    latitude: float
    longitude: float
    price_vnd: int
    bedrooms: int
    location_precision: LocationPrecision


class MapResponse(Schema):
    markers: list[MapMarker]
    total: int
    truncated: bool
