import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import presenters
from app.api.deps import AdminUser, AppSettings, DbSession, limit_admin_write, require_admin
from app.core.config import Settings
from app.models import Apartment
from app.models.enums import ApartmentStatus, Language
from app.schemas.apartment import (
    AdminApartmentListItem,
    AdminApartmentOut,
    ApartmentCreate,
    ApartmentUpdate,
    DashboardOut,
    StatusUpdate,
)
from app.schemas.common import Page, Schema
from app.services import apartments, geocoding

# Every route here requires a verified administrator, whatever the frontend shows.
router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_admin)])
write = [Depends(limit_admin_write)]


async def _detail(db: AsyncSession, settings: Settings, apartment: Apartment) -> AdminApartmentOut:
    missing = apartments.missing_publish_fields(apartment, len(apartment.images))
    publication = await apartments.latest_publication(db, apartment.id)
    return presenters.admin_detail(settings, apartment, missing, publication)


class GeocodeResultOut(Schema):
    label: str
    latitude: float
    longitude: float
    kind: str | None


@router.get("/geocode", response_model=list[GeocodeResultOut])
async def geocode(
    settings: AppSettings,
    q: Annotated[str, Query(min_length=2, max_length=200)],
    lang: Language = Language.EN,
) -> list[GeocodeResultOut]:
    """Search addresses and landmarks inside the service area (admin location picker)."""
    results = await geocoding.search(settings, q, lang.value)
    return [GeocodeResultOut.model_validate(result) for result in results]


@router.get("/dashboard", response_model=DashboardOut)
async def dashboard(db: DbSession) -> DashboardOut:
    counts = await apartments.dashboard_counts(db)
    return DashboardOut(
        total=sum(counts.values()),
        available=counts[ApartmentStatus.AVAILABLE],
        draft=counts[ApartmentStatus.DRAFT],
        rented=counts[ApartmentStatus.RENTED],
        archived=counts[ApartmentStatus.ARCHIVED],
    )


@router.get("/apartments", response_model=Page[AdminApartmentListItem])
async def list_apartments(
    db: DbSession,
    settings: AppSettings,
    q: Annotated[str | None, Query(max_length=200, description="Search in title")] = None,
    status_filter: Annotated[ApartmentStatus | None, Query(alias="status")] = None,
    page: Annotated[int, Query(ge=1, le=10_000)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> Page[AdminApartmentListItem]:
    rows, total = await apartments.list_for_admin(
        db, query=q, status=status_filter, page=page, page_size=page_size
    )
    return Page(
        items=[
            presenters.admin_list_item(settings, row.apartment, row.publication_status)
            for row in rows
        ],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post(
    "/apartments",
    response_model=AdminApartmentOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=write,
)
async def create_apartment(
    body: ApartmentCreate, db: DbSession, settings: AppSettings, admin: AdminUser
) -> AdminApartmentOut:
    apartment = await apartments.create(db, settings, admin, body)
    return await _detail(db, settings, apartment)


@router.get("/apartments/{apartment_id}", response_model=AdminApartmentOut)
async def get_apartment(
    apartment_id: uuid.UUID, db: DbSession, settings: AppSettings
) -> AdminApartmentOut:
    apartment = await apartments.get_for_admin(db, apartment_id)
    return await _detail(db, settings, apartment)


@router.patch("/apartments/{apartment_id}", response_model=AdminApartmentOut, dependencies=write)
async def update_apartment(
    apartment_id: uuid.UUID, body: ApartmentUpdate, db: DbSession, settings: AppSettings
) -> AdminApartmentOut:
    apartment = await apartments.update(db, settings, apartment_id, body)
    return await _detail(db, settings, apartment)


@router.patch(
    "/apartments/{apartment_id}/status", response_model=AdminApartmentOut, dependencies=write
)
async def change_status(
    apartment_id: uuid.UUID, body: StatusUpdate, db: DbSession, settings: AppSettings
) -> AdminApartmentOut:
    apartment = await apartments.change_status(db, apartment_id, body.status)
    return await _detail(db, settings, apartment)


@router.delete(
    "/apartments/{apartment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    dependencies=write,
)
async def delete_apartment(apartment_id: uuid.UUID, db: DbSession) -> None:
    """Soft delete: the listing disappears everywhere but stays recoverable in the database."""
    await apartments.soft_delete(db, apartment_id)
