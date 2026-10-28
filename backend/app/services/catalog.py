"""Public catalog queries. Only live, `available` listings are ever returned."""

import uuid
from typing import Any

from sqlalchemy import ColumnElement, Select, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.errors import AppError
from app.models import Apartment
from app.models.enums import ApartmentStatus
from app.schemas.catalog import BEDROOMS_3_PLUS, CatalogFilters, CatalogSort

MAP_MARKER_LIMIT = 500


def _public_conditions(
    filters: CatalogFilters, owner_id: uuid.UUID | None
) -> list[ColumnElement[bool]]:
    conditions: list[ColumnElement[bool]] = [
        Apartment.deleted_at.is_(None),
        Apartment.status == ApartmentStatus.AVAILABLE,
    ]
    if owner_id is not None:
        conditions.append(Apartment.created_by == owner_id)
    if filters.min_price is not None:
        conditions.append(Apartment.price_vnd >= filters.min_price)
    if filters.max_price is not None:
        conditions.append(Apartment.price_vnd <= filters.max_price)
    if filters.bedrooms:
        exact = sorted(b for b in filters.bedrooms if b < BEDROOMS_3_PLUS)
        options: list[ColumnElement[bool]] = []
        if exact:
            options.append(Apartment.bedrooms.in_(exact))
        if BEDROOMS_3_PLUS in filters.bedrooms:
            options.append(Apartment.bedrooms >= BEDROOMS_3_PLUS)
        conditions.append(or_(*options))
    if filters.district_ids:
        conditions.append(Apartment.district_id.in_(sorted(filters.district_ids)))
    if filters.min_area is not None:
        conditions.append(Apartment.area_sqm >= filters.min_area)
    if filters.max_area is not None:
        conditions.append(Apartment.area_sqm <= filters.max_area)
    if filters.amenities:
        conditions.append(Apartment.amenities.contains(list(filters.amenities)))
    if filters.bbox is not None:
        box = filters.bbox
        envelope = func.ST_MakeEnvelope(box.min_lng, box.min_lat, box.max_lng, box.max_lat, 4326)
        conditions.append(Apartment.location.op("&&")(envelope))
    return conditions


def _ordering(sort: CatalogSort) -> tuple[Any, ...]:
    match sort:
        case CatalogSort.PRICE_ASC:
            return (Apartment.price_vnd.asc(), Apartment.id)
        case CatalogSort.PRICE_DESC:
            return (Apartment.price_vnd.desc(), Apartment.id)
        case CatalogSort.NEWEST:
            return (Apartment.updated_at.desc(), Apartment.id)


async def _count(db: AsyncSession, conditions: list[ColumnElement[bool]]) -> int:
    total = await db.scalar(select(func.count()).select_from(Apartment).where(*conditions))
    return total or 0


async def list_public(
    db: AsyncSession,
    filters: CatalogFilters,
    sort: CatalogSort,
    page: int,
    page_size: int,
    owner_id: uuid.UUID | None = None,
) -> tuple[list[Apartment], int]:
    """`owner_id` limits the catalog to one landlord's listings (what a landlord sees)."""
    conditions = _public_conditions(filters, owner_id)
    query: Select[Apartment] = (
        select(Apartment)
        .where(*conditions)
        .options(selectinload(Apartment.district), selectinload(Apartment.cover_image))
        .order_by(*_ordering(sort))
        .limit(page_size)
        .offset((page - 1) * page_size)
    )
    items = list((await db.scalars(query)).all())
    return items, await _count(db, conditions)


async def map_markers(
    db: AsyncSession, filters: CatalogFilters, owner_id: uuid.UUID | None = None
) -> tuple[list[Any], int, bool]:
    """Lightweight marker rows inside the bbox; capped to keep payloads small."""
    conditions = _public_conditions(filters, owner_id)
    rows = (
        await db.execute(
            select(
                Apartment.id,
                Apartment.latitude,
                Apartment.longitude,
                Apartment.price_vnd,
                Apartment.bedrooms,
                Apartment.location_precision,
            )
            .where(*conditions)
            .order_by(Apartment.updated_at.desc(), Apartment.id)
            .limit(MAP_MARKER_LIMIT + 1)
        )
    ).all()
    truncated = len(rows) > MAP_MARKER_LIMIT
    rows = rows[:MAP_MARKER_LIMIT]
    total = await _count(db, conditions) if truncated else len(rows)
    return list(rows), total, truncated


async def get_public(db: AsyncSession, apartment_id: uuid.UUID) -> Apartment:
    apartment = await db.scalar(
        select(Apartment)
        .where(Apartment.id == apartment_id, Apartment.deleted_at.is_(None))
        .options(
            selectinload(Apartment.district),
            selectinload(Apartment.images),
            selectinload(Apartment.cover_image),
        )
    )
    if apartment is None or apartment.status is ApartmentStatus.DRAFT:
        raise AppError("listing_not_found", "Listing not found", status_code=404)
    if apartment.status is not ApartmentStatus.AVAILABLE:
        # Rented/archived: tell the client it existed (shared links), but disclose nothing.
        raise AppError("listing_unavailable", "Listing is no longer available", status_code=410)
    return apartment
