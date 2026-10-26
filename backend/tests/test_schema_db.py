"""Integration tests against a real PostGIS database.

Run with TEST_DATABASE_URL pointing at a disposable database, e.g. inside Docker Compose:
    docker compose exec backend sh -c 'TEST_DATABASE_URL=$DATABASE_URL_TEST pytest -m db'
The database is migrated to head and wiped back to base.
"""

import os
import uuid
from collections.abc import AsyncIterator, Iterator

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncConnection, create_async_engine

from tests.test_migrations import BACKEND_DIR

TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL")

pytestmark = [
    pytest.mark.db,
    pytest.mark.skipif(not TEST_DATABASE_URL, reason="TEST_DATABASE_URL not set"),
]


@pytest.fixture(scope="module")
def migrated_db() -> Iterator[str]:
    assert TEST_DATABASE_URL
    os.environ["DATABASE_URL"] = TEST_DATABASE_URL
    from app.core.config import get_settings

    get_settings.cache_clear()
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    command.downgrade(config, "base")
    command.upgrade(config, "head")
    yield TEST_DATABASE_URL
    command.downgrade(config, "base")


@pytest.fixture
async def conn(migrated_db: str) -> AsyncIterator[AsyncConnection]:
    engine = create_async_engine(migrated_db)
    async with engine.connect() as connection:
        transaction = await connection.begin()
        yield connection
        await transaction.rollback()
    await engine.dispose()


async def _district_id(conn: AsyncConnection) -> int:
    result = await conn.execute(text("SELECT id FROM districts WHERE slug = 'son-tra'"))
    district_id: int = result.scalar_one()
    return district_id


async def test_districts_seeded(conn: AsyncConnection) -> None:
    count = (await conn.execute(text("SELECT count(*) FROM districts WHERE active"))).scalar_one()
    assert count == 7


async def test_incomplete_draft_allowed(conn: AsyncConnection) -> None:
    await conn.execute(
        text("INSERT INTO apartments (id, title) VALUES (:id, 'WIP')"), {"id": uuid.uuid4()}
    )


async def test_incomplete_listing_cannot_be_available(conn: AsyncConnection) -> None:
    with pytest.raises(IntegrityError, match="ck_apartments_publishable_fields"):
        await conn.execute(
            text("INSERT INTO apartments (id, title, status) VALUES (:id, 'x', 'available')"),
            {"id": uuid.uuid4()},
        )


async def test_location_generated_and_bbox_queryable(conn: AsyncConnection) -> None:
    apartment_id = uuid.uuid4()
    await conn.execute(
        text(
            "INSERT INTO apartments (id, title, price_vnd, district_id, bedrooms, latitude, "
            "longitude, location_precision, status) VALUES (:id, 'Beach flat', 12000000, :d, 1, "
            "16.0612, 108.2475, 'exact', 'available')"
        ),
        {"id": apartment_id, "d": await _district_id(conn)},
    )
    found = (
        (
            await conn.execute(
                text(
                    "SELECT id FROM apartments "
                    "WHERE location && ST_MakeEnvelope(108.2, 16.0, 108.3, 16.1, 4326)"
                )
            )
        )
        .scalars()
        .all()
    )
    assert apartment_id in found


async def test_only_one_active_publication(conn: AsyncConnection) -> None:
    apartment_id = uuid.uuid4()
    await conn.execute(text("INSERT INTO apartments (id) VALUES (:id)"), {"id": apartment_id})
    insert = text(
        "INSERT INTO telegram_publications (id, apartment_id, telegram_channel_id, status, "
        "idempotency_key) VALUES (:id, :a, '-100123', :s, :k)"
    )
    await conn.execute(insert, {"id": uuid.uuid4(), "a": apartment_id, "s": "failed", "k": "k1"})
    await conn.execute(insert, {"id": uuid.uuid4(), "a": apartment_id, "s": "succeeded", "k": "k2"})
    with pytest.raises(IntegrityError, match="uq_telegram_publications_active"):
        await conn.execute(
            insert, {"id": uuid.uuid4(), "a": apartment_id, "s": "pending", "k": "k3"}
        )
