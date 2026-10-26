"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-10-26
"""

from collections.abc import Sequence

import geoalchemy2
import sqlalchemy as sa
from alembic import op

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _enum(name: str, *values: str) -> sa.Enum:
    return sa.Enum(*values, name=name, native_enum=False, create_constraint=True, length=32)


def _timestamps() -> list[sa.Column[object]]:
    return [
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    ]


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")

    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("telegram_user_id", sa.BigInteger(), nullable=False),
        sa.Column("username", sa.String(64)),
        sa.Column("display_name", sa.String(256)),
        sa.Column("role", _enum("user_role", "user", "admin"), nullable=False),
        sa.Column("preferred_language", _enum("language", "en", "ru")),
        *_timestamps(),
        sa.UniqueConstraint("telegram_user_id", name=op.f("uq_users_telegram_user_id")),
    )

    op.create_table(
        "districts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name_en", sa.String(128), nullable=False),
        sa.Column("name_ru", sa.String(128), nullable=False),
        sa.Column("slug", sa.String(64), nullable=False),
        sa.Column("active", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.UniqueConstraint("slug", name=op.f("uq_districts_slug")),
    )

    op.create_table(
        "apartments",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("created_by", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("title", sa.String(200)),
        sa.Column("description", sa.Text()),
        sa.Column("price_vnd", sa.BigInteger()),
        sa.Column("area_sqm", sa.Numeric(7, 1)),
        sa.Column("bedrooms", sa.SmallInteger()),
        sa.Column("bathrooms", sa.SmallInteger()),
        sa.Column("district_id", sa.Integer(), sa.ForeignKey("districts.id", ondelete="RESTRICT")),
        sa.Column("address", sa.String(500)),
        sa.Column("latitude", sa.Double()),
        sa.Column("longitude", sa.Double()),
        sa.Column(
            "location",
            geoalchemy2.Geometry("POINT", srid=4326, spatial_index=False),
            sa.Computed("ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)", persisted=True),
        ),
        sa.Column("location_precision", _enum("location_precision", "exact", "approximate")),
        sa.Column("deposit_vnd", sa.BigInteger()),
        sa.Column("minimum_rental_months", sa.SmallInteger()),
        sa.Column("rental_conditions", sa.Text()),
        sa.Column(
            "agent_contact_type",
            _enum("contact_type", "telegram_username", "telegram_link", "phone"),
        ),
        sa.Column("agent_contact_value", sa.String(256)),
        sa.Column(
            "status",
            _enum("apartment_status", "draft", "available", "rented", "archived"),
            server_default="draft",
            nullable=False,
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
        *_timestamps(),
        sa.CheckConstraint(
            "status = 'draft' OR (title IS NOT NULL AND price_vnd IS NOT NULL AND district_id IS NOT NULL "
            "AND bedrooms IS NOT NULL AND latitude IS NOT NULL AND longitude IS NOT NULL "
            "AND location_precision IS NOT NULL)",
            name="publishable_fields",
        ),
        sa.CheckConstraint("price_vnd > 0", name="price_positive"),
        sa.CheckConstraint("deposit_vnd >= 0", name="deposit_non_negative"),
        sa.CheckConstraint("area_sqm > 0", name="area_positive"),
        sa.CheckConstraint("bedrooms BETWEEN 0 AND 20", name="bedrooms_range"),
        sa.CheckConstraint("bathrooms BETWEEN 0 AND 20", name="bathrooms_range"),
        sa.CheckConstraint("minimum_rental_months BETWEEN 1 AND 120", name="min_months_range"),
        sa.CheckConstraint("latitude BETWEEN -90 AND 90", name="latitude_range"),
        sa.CheckConstraint("longitude BETWEEN -180 AND 180", name="longitude_range"),
        sa.CheckConstraint("(latitude IS NULL) = (longitude IS NULL)", name="coordinates_paired"),
        sa.CheckConstraint(
            "(agent_contact_type IS NULL) = (agent_contact_value IS NULL)",
            name="agent_contact_paired",
        ),
    )
    op.create_index(op.f("ix_apartments_district_id"), "apartments", ["district_id"])
    op.create_index("ix_apartments_location", "apartments", ["location"], postgresql_using="gist")
    op.create_index(
        "ix_apartments_status_price",
        "apartments",
        ["status", "price_vnd"],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.create_index("ix_apartments_updated_at", "apartments", ["updated_at"])

    op.create_table(
        "apartment_images",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "apartment_id",
            sa.Uuid(),
            sa.ForeignKey("apartments.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("storage_key", sa.String(512), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("width", sa.Integer(), nullable=False),
        sa.Column("height", sa.Integer(), nullable=False),
        sa.Column("content_type", sa.String(64), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.UniqueConstraint("storage_key", name=op.f("uq_apartment_images_storage_key")),
        sa.UniqueConstraint(
            "apartment_id",
            "sort_order",
            name="uq_apartment_images_apartment_id_sort_order",
            deferrable=True,
            initially="DEFERRED",
        ),
        sa.CheckConstraint("sort_order >= 0", name="sort_order_non_negative"),
        sa.CheckConstraint("width > 0 AND height > 0", name="dimensions_positive"),
    )

    op.create_table(
        "telegram_publications",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "apartment_id",
            sa.Uuid(),
            sa.ForeignKey("apartments.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("telegram_channel_id", sa.String(64), nullable=False),
        sa.Column("telegram_message_id", sa.BigInteger()),
        sa.Column("published_by", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column(
            "status",
            _enum("publication_status", "pending", "succeeded", "failed", "unknown"),
            nullable=False,
        ),
        sa.Column("idempotency_key", sa.String(128), nullable=False),
        sa.Column("error_message", sa.Text()),
        *_timestamps(),
        sa.Column("published_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint(
            "idempotency_key", name=op.f("uq_telegram_publications_idempotency_key")
        ),
    )
    op.create_index(
        op.f("ix_telegram_publications_apartment_id"), "telegram_publications", ["apartment_id"]
    )
    op.create_index(
        "uq_telegram_publications_active",
        "telegram_publications",
        ["apartment_id", "telegram_channel_id"],
        unique=True,
        postgresql_where=sa.text("status IN ('pending', 'succeeded', 'unknown')"),
    )


def downgrade() -> None:
    op.drop_table("telegram_publications")
    op.drop_table("apartment_images")
    op.drop_table("apartments")
    op.drop_table("districts")
    op.drop_table("users")
    # The postgis extension is intentionally left installed.
