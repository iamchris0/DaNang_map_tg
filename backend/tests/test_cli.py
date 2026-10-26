import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.cli import DEMO_LISTINGS, DEMO_PREFIX, create_demo_listings
from app.models import Apartment, ApartmentImage
from app.models.enums import ApartmentStatus
from tests.conftest import MemoryStorage, requires_db

pytestmark = [pytest.mark.db, requires_db]


async def _live_demo_count(db: AsyncSession) -> int:
    count = await db.scalar(
        select(func.count())
        .select_from(Apartment)
        .where(Apartment.title.startswith(DEMO_PREFIX), Apartment.deleted_at.is_(None))
    )
    return count or 0


async def test_seed_demo_creates_labelled_complete_listings(
    db: AsyncSession, storage: MemoryStorage
) -> None:
    created = await create_demo_listings(db, storage, reset=False)
    assert created == len(DEMO_LISTINGS) and 15 <= created <= 20
    apartments = (
        await db.scalars(select(Apartment).where(Apartment.title.startswith(DEMO_PREFIX)))
    ).all()
    assert all(a.status is ApartmentStatus.AVAILABLE for a in apartments)
    assert all("not real rental inventory" in (a.description or "") for a in apartments)
    assert len({a.district_id for a in apartments}) >= 6  # spread across the city
    image_count = await db.scalar(select(func.count()).select_from(ApartmentImage))
    assert image_count and image_count >= created
    assert len(storage.objects) == 2 * image_count  # lg + sm variants


async def test_seed_demo_is_idempotent_and_resettable(
    db: AsyncSession, storage: MemoryStorage
) -> None:
    await create_demo_listings(db, storage, reset=False)
    assert await create_demo_listings(db, storage, reset=False) == 0
    assert await _live_demo_count(db) == len(DEMO_LISTINGS)
    assert await create_demo_listings(db, storage, reset=True) == len(DEMO_LISTINGS)
    assert await _live_demo_count(db) == len(DEMO_LISTINGS)
