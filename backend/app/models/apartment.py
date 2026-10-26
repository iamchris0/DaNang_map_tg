import uuid
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Any

from geoalchemy2 import Geometry
from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Computed,
    DateTime,
    Double,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    SmallInteger,
    String,
    Text,
    Uuid,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin
from app.models.enums import ApartmentStatus, ContactType, LocationPrecision, str_enum

if TYPE_CHECKING:
    from app.models.district import District
    from app.models.image import ApartmentImage

# Fields that must be present before a listing can leave the draft state.
# Photo presence is enforced by the service layer (it lives in another table).
PUBLISH_REQUIRED_COLUMNS = (
    "title",
    "price_vnd",
    "district_id",
    "bedrooms",
    "latitude",
    "longitude",
    "location_precision",
)


class Apartment(TimestampMixin, Base):
    __tablename__ = "apartments"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )

    title: Mapped[str | None] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text)
    price_vnd: Mapped[int | None] = mapped_column(BigInteger)
    area_sqm: Mapped[Decimal | None] = mapped_column(Numeric(7, 1))
    bedrooms: Mapped[int | None] = mapped_column(SmallInteger)  # 0 = studio
    bathrooms: Mapped[int | None] = mapped_column(SmallInteger)
    district_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("districts.id", ondelete="RESTRICT"), index=True
    )
    address: Mapped[str | None] = mapped_column(String(500))

    latitude: Mapped[float | None] = mapped_column(Double)
    longitude: Mapped[float | None] = mapped_column(Double)
    # Derived by PostgreSQL from latitude/longitude so the two can never disagree.
    location: Mapped[Any] = mapped_column(
        Geometry("POINT", srid=4326, spatial_index=False),
        Computed("ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)", persisted=True),
    )
    location_precision: Mapped[LocationPrecision | None] = mapped_column(
        str_enum(LocationPrecision, "location_precision")
    )

    deposit_vnd: Mapped[int | None] = mapped_column(BigInteger)
    minimum_rental_months: Mapped[int | None] = mapped_column(SmallInteger)
    rental_conditions: Mapped[str | None] = mapped_column(Text)

    agent_contact_type: Mapped[ContactType | None] = mapped_column(
        str_enum(ContactType, "contact_type")
    )
    agent_contact_value: Mapped[str | None] = mapped_column(String(256))

    status: Mapped[ApartmentStatus] = mapped_column(
        str_enum(ApartmentStatus, "apartment_status"),
        nullable=False,
        default=ApartmentStatus.DRAFT,
        server_default=ApartmentStatus.DRAFT.value,
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    district: Mapped["District | None"] = relationship(lazy="raise")
    images: Mapped[list["ApartmentImage"]] = relationship(
        back_populates="apartment",
        order_by="ApartmentImage.sort_order",
        cascade="all, delete-orphan",
        passive_deletes=True,
        lazy="raise",
    )
    # Cover = image with sort_order 0 (the image service keeps orders contiguous from 0).
    cover_image: Mapped["ApartmentImage | None"] = relationship(
        primaryjoin="and_(Apartment.id == ApartmentImage.apartment_id, "
        "ApartmentImage.sort_order == 0)",
        viewonly=True,
        uselist=False,
        lazy="raise",
    )

    __table_args__ = (
        CheckConstraint(
            "status = 'draft' OR ("
            + " AND ".join(f"{col} IS NOT NULL" for col in PUBLISH_REQUIRED_COLUMNS)
            + ")",
            name="publishable_fields",
        ),
        CheckConstraint("price_vnd > 0", name="price_positive"),
        CheckConstraint("deposit_vnd >= 0", name="deposit_non_negative"),
        CheckConstraint("area_sqm > 0", name="area_positive"),
        CheckConstraint("bedrooms BETWEEN 0 AND 20", name="bedrooms_range"),
        CheckConstraint("bathrooms BETWEEN 0 AND 20", name="bathrooms_range"),
        CheckConstraint("minimum_rental_months BETWEEN 1 AND 120", name="min_months_range"),
        CheckConstraint("latitude BETWEEN -90 AND 90", name="latitude_range"),
        CheckConstraint("longitude BETWEEN -180 AND 180", name="longitude_range"),
        CheckConstraint("(latitude IS NULL) = (longitude IS NULL)", name="coordinates_paired"),
        CheckConstraint(
            "(agent_contact_type IS NULL) = (agent_contact_value IS NULL)",
            name="agent_contact_paired",
        ),
        Index("ix_apartments_location", "location", postgresql_using="gist"),
        # Public catalog queries: live rows filtered by status and price.
        Index(
            "ix_apartments_status_price",
            "status",
            "price_vnd",
            postgresql_where=text("deleted_at IS NULL"),
        ),
        Index("ix_apartments_updated_at", "updated_at"),
    )
