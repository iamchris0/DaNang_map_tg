"""Administrator-side listing management: CRUD, validation and the status lifecycle."""

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import ColumnElement, ScalarSelect, Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.errors import AppError
from app.core.config import Settings
from app.models import Apartment, ApartmentImage, District, TelegramPublication, User
from app.models.apartment import PUBLISH_REQUIRED_COLUMNS
from app.models.enums import ApartmentStatus, PublicationStatus
from app.schemas.apartment import ApartmentCreate, ApartmentUpdate

S = ApartmentStatus
ALLOWED_TRANSITIONS: dict[ApartmentStatus, frozenset[ApartmentStatus]] = {
    S.DRAFT: frozenset({S.AVAILABLE, S.ARCHIVED}),
    S.AVAILABLE: frozenset({S.RENTED, S.ARCHIVED}),
    S.RENTED: frozenset({S.AVAILABLE, S.ARCHIVED}),
    S.ARCHIVED: frozenset({S.AVAILABLE}),
}
IMAGES_FIELD = "images"


def not_found() -> AppError:
    return AppError("listing_not_found", "Listing not found", status_code=404)


def _live() -> Select[Apartment]:
    return select(Apartment).where(Apartment.deleted_at.is_(None))


async def get_for_admin(db: AsyncSession, apartment_id: uuid.UUID) -> Apartment:
    apartment = await db.scalar(
        _live()
        .where(Apartment.id == apartment_id)
        .options(selectinload(Apartment.district), selectinload(Apartment.images))
        .execution_options(populate_existing=True)
    )
    if apartment is None:
        raise not_found()
    return apartment


async def _lock(db: AsyncSession, apartment_id: uuid.UUID) -> Apartment:
    apartment = await db.scalar(_live().where(Apartment.id == apartment_id).with_for_update())
    if apartment is None:
        raise not_found()
    return apartment


async def _image_count(db: AsyncSession, apartment_id: uuid.UUID) -> int:
    count = await db.scalar(select(func.count()).where(ApartmentImage.apartment_id == apartment_id))
    return count or 0


def missing_publish_fields(apartment: Apartment, image_count: int) -> list[str]:
    missing = [col for col in PUBLISH_REQUIRED_COLUMNS if getattr(apartment, col) is None]
    if image_count == 0:
        missing.append(IMAGES_FIELD)
    return missing


async def _validate_references(
    db: AsyncSession, settings: Settings, values: dict[str, object]
) -> None:
    district_id = values.get("district_id")
    if district_id is not None:
        active = await db.scalar(select(District.active).where(District.id == district_id))
        if not active:
            raise AppError("invalid_district", "Unknown or inactive district", status_code=422)

    lat, lng = values.get("latitude"), values.get("longitude")
    if isinstance(lat, float) and isinstance(lng, float):
        min_lng, min_lat, max_lng, max_lat = settings.service_area_bbox
        if not (min_lat <= lat <= max_lat and min_lng <= lng <= max_lng):
            raise AppError(
                "location_out_of_service_area",
                "Location is outside the Da Nang service area",
                status_code=422,
            )


def _incomplete(missing: list[str]) -> AppError:
    return AppError(
        "listing_incomplete",
        "Listing is missing fields required for publication",
        status_code=422,
        details={"missing_fields": missing},
    )


async def create(
    db: AsyncSession, settings: Settings, admin: User, data: ApartmentCreate
) -> Apartment:
    values = data.model_dump(exclude_unset=True)
    await _validate_references(db, settings, values)
    apartment = Apartment(**values, status=ApartmentStatus.DRAFT, created_by=admin.id)
    db.add(apartment)
    await db.commit()
    return await get_for_admin(db, apartment.id)


async def update(
    db: AsyncSession, settings: Settings, apartment_id: uuid.UUID, data: ApartmentUpdate
) -> Apartment:
    apartment = await _lock(db, apartment_id)
    values = data.model_dump(exclude_unset=True)
    await _validate_references(db, settings, values)
    # Query before mutating so autoflush can't send an invalid row to the database.
    image_count = await _image_count(db, apartment.id)
    for name, value in values.items():
        setattr(apartment, name, value)
    # Switching between "amount" and "months" clears the other form.
    if values.get("deposit_vnd") is not None:
        apartment.deposit_months = None
    elif values.get("deposit_months") is not None:
        apartment.deposit_vnd = None
    # Public (or previously public) listings must stay complete.
    if apartment.status is not ApartmentStatus.DRAFT:
        missing = missing_publish_fields(apartment, image_count)
        if missing:
            await db.rollback()
            raise _incomplete(missing)
    await db.commit()
    return await get_for_admin(db, apartment_id)


async def change_status(
    db: AsyncSession, apartment_id: uuid.UUID, new_status: ApartmentStatus
) -> Apartment:
    apartment = await _lock(db, apartment_id)
    current = apartment.status
    if new_status is not current:
        if new_status not in ALLOWED_TRANSITIONS[current]:
            await db.rollback()
            raise AppError(
                "invalid_status_transition",
                f"Cannot change status from {current} to {new_status}",
                status_code=409,
                details={"from": current, "to": new_status},
            )
        if new_status is ApartmentStatus.AVAILABLE:
            missing = missing_publish_fields(apartment, await _image_count(db, apartment.id))
            if missing:
                await db.rollback()
                raise _incomplete(missing)
        apartment.status = new_status
    await db.commit()
    return await get_for_admin(db, apartment_id)


async def soft_delete(db: AsyncSession, apartment_id: uuid.UUID) -> None:
    apartment = await _lock(db, apartment_id)
    apartment.deleted_at = datetime.now(UTC)
    await db.commit()


def _owned(owner_id: uuid.UUID | None) -> list[ColumnElement[bool]]:
    """Live listings, optionally only those created by one landlord."""
    conditions: list[ColumnElement[bool]] = [Apartment.deleted_at.is_(None)]
    if owner_id is not None:
        conditions.append(Apartment.created_by == owner_id)
    return conditions


async def ensure_owner(db: AsyncSession, apartment_id: uuid.UUID, owner_id: uuid.UUID) -> None:
    """404 unless the listing exists and belongs to this landlord (others' stay invisible)."""
    found = await db.scalar(
        select(Apartment.id).where(Apartment.id == apartment_id, *_owned(owner_id))
    )
    if found is None:
        raise not_found()


@dataclass(frozen=True, slots=True)
class AdminListRow:
    apartment: Apartment
    publication_status: PublicationStatus | None


def _latest_publication_status() -> ScalarSelect[PublicationStatus]:
    return (
        select(TelegramPublication.status)
        .where(TelegramPublication.apartment_id == Apartment.id)
        .order_by(TelegramPublication.created_at.desc())
        .limit(1)
        .correlate(Apartment)
        .scalar_subquery()
    )


async def list_for_admin(
    db: AsyncSession,
    *,
    query: str | None,
    status: ApartmentStatus | None,
    page: int,
    page_size: int,
    owner_id: uuid.UUID | None = None,
) -> tuple[list[AdminListRow], int]:
    conditions = _owned(owner_id)
    if query:
        escaped = query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        conditions.append(Apartment.title.ilike(f"%{escaped}%", escape="\\"))
    if status is not None:
        conditions.append(Apartment.status == status)

    total = await db.scalar(select(func.count()).select_from(Apartment).where(*conditions))
    rows = await db.execute(
        select(Apartment, _latest_publication_status())
        .where(*conditions)
        .options(selectinload(Apartment.district), selectinload(Apartment.cover_image))
        .order_by(Apartment.updated_at.desc(), Apartment.id)
        .limit(page_size)
        .offset((page - 1) * page_size)
    )
    items = [AdminListRow(apartment=row[0], publication_status=row[1]) for row in rows]
    return items, total or 0


async def dashboard_counts(
    db: AsyncSession, owner_id: uuid.UUID | None = None
) -> dict[ApartmentStatus, int]:
    rows = await db.execute(
        select(Apartment.status, func.count()).where(*_owned(owner_id)).group_by(Apartment.status)
    )
    counts = dict.fromkeys(ApartmentStatus, 0)
    for status, count in rows:
        counts[status] = count
    return counts


async def latest_publication(
    db: AsyncSession, apartment_id: uuid.UUID
) -> TelegramPublication | None:
    return await db.scalar(
        select(TelegramPublication)
        .where(TelegramPublication.apartment_id == apartment_id)
        .order_by(TelegramPublication.created_at.desc())
        .limit(1)
    )
