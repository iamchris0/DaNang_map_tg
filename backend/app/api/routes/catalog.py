import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select

from app.api import presenters
from app.api.deps import AppSettings, DbSession, OptionalUser
from app.api.errors import AppError
from app.core.config import Settings
from app.models import District, User
from app.schemas.apartment import MapResponse, PublicApartmentCard, PublicApartmentDetail
from app.schemas.catalog import CatalogFilters, CatalogSort, catalog_filters
from app.schemas.common import DistrictOut, Page
from app.services import catalog
from app.services.users import is_admin, is_super_admin

router = APIRouter(tags=["catalog"])

Filters = Annotated[CatalogFilters, Depends(catalog_filters)]


def _owner_view(settings: Settings, user: User | None) -> uuid.UUID | None:
    """A landlord sees only their own listings in the catalog; everyone else sees all."""
    if user and is_admin(settings, user) and not is_super_admin(settings, user):
        return user.id
    return None


@router.get("/districts", response_model=list[DistrictOut])
async def list_districts(db: DbSession) -> list[DistrictOut]:
    districts = await db.scalars(select(District).where(District.active).order_by(District.name_en))
    return [DistrictOut.model_validate(district) for district in districts]


@router.get("/apartments", response_model=Page[PublicApartmentCard])
async def list_apartments(
    db: DbSession,
    settings: AppSettings,
    filters: Filters,
    user: OptionalUser,
    sort: CatalogSort = CatalogSort.NEWEST,
    page: Annotated[int, Query(ge=1, le=10_000)] = 1,
    page_size: Annotated[int, Query(ge=1, le=50)] = 20,
) -> Page[PublicApartmentCard]:
    items, total = await catalog.list_public(
        db, filters, sort, page, page_size, _owner_view(settings, user)
    )
    return Page(
        items=[presenters.public_card(settings, apartment) for apartment in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/apartments/map", response_model=MapResponse)
async def map_apartments(
    db: DbSession, settings: AppSettings, filters: Filters, user: OptionalUser
) -> MapResponse:
    """Markers inside the current viewport (`bbox` is required) matching the filters."""
    if filters.bbox is None:
        raise AppError(
            "validation_error",
            "Request validation failed",
            status_code=422,
            details=[{"loc": ["query", "bbox"], "msg": "bbox is required", "type": "missing"}],
        )
    rows, total, truncated = await catalog.map_markers(db, filters, _owner_view(settings, user))
    return MapResponse(
        markers=[presenters.map_marker(row) for row in rows], total=total, truncated=truncated
    )


@router.get("/apartments/{apartment_id}", response_model=PublicApartmentDetail)
async def get_apartment(
    apartment_id: uuid.UUID, db: DbSession, settings: AppSettings
) -> PublicApartmentDetail:
    apartment = await catalog.get_public(db, apartment_id)
    return presenters.public_detail(settings, apartment)
