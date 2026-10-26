import os

# Must be set before app modules read settings.
os.environ.setdefault("ENVIRONMENT", "test")
os.environ.setdefault("S3_AUTO_CREATE_BUCKET", "false")

from collections.abc import AsyncIterator, Iterator
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from pydantic import SecretStr
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from app.core import rate_limit
from app.core.config import Settings, get_settings
from app.core.storage import get_storage
from app.db.session import get_db
from app.main import create_app

BACKEND_DIR = Path(__file__).resolve().parents[1]
TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL")
TEST_BOT_TOKEN = "123456789:TEST-token-for-unit-tests-only_abcdef"
ADMIN_TG_ID = 1001
USER_TG_ID = 2002

requires_db = pytest.mark.skipif(not TEST_DATABASE_URL, reason="TEST_DATABASE_URL not set")


def alembic_config() -> Config:
    return Config(str(BACKEND_DIR / "alembic.ini"))


@pytest.fixture(autouse=True)
async def _isolate_global_state() -> AsyncIterator[None]:
    get_settings.cache_clear()
    await rate_limit.storage.reset()
    yield
    get_settings.cache_clear()


@pytest.fixture
def settings() -> Settings:
    """Settings used by API tests; tweak attributes per test as needed."""
    return Settings(
        _env_file=None,
        environment="test",
        telegram_bot_token=SecretStr(TEST_BOT_TOKEN),
        session_secret=SecretStr("test-session-secret-0123456789abcdef"),
        admin_telegram_user_ids=frozenset({ADMIN_TG_ID}),
        admin_contact_telegram="danang_admin",
        telegram_bot_username="DaNangAptBot",
        telegram_mini_app_short_name="app",
        s3_public_base_url="https://img.example.test",
        s3_auto_create_bucket=False,
        dev_auth_enabled=False,
        rate_limit_auth="20/minute",
        rate_limit_admin_write="120/minute",
        cors_origins=[],
    )


class MemoryStorage:
    """In-memory ObjectStorage used instead of S3 in tests."""

    def __init__(self) -> None:
        self.objects: dict[str, tuple[bytes, str]] = {}

    def put(self, key: str, data: bytes, content_type: str) -> None:
        self.objects[key] = (data, content_type)

    def get(self, key: str) -> bytes:
        return self.objects[key][0]

    def delete(self, keys: list[str]) -> None:
        for key in keys:
            self.objects.pop(key, None)


@pytest.fixture
def storage() -> MemoryStorage:
    return MemoryStorage()


@pytest.fixture
def app(settings: Settings, storage: MemoryStorage) -> FastAPI:
    application = create_app()
    application.dependency_overrides[get_settings] = lambda: settings
    application.dependency_overrides[get_storage] = lambda: storage
    return application


@pytest.fixture
async def client(app: FastAPI) -> AsyncIterator[AsyncClient]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac


# --- PostGIS-backed fixtures ---------------------------------------------------------------


@pytest.fixture(scope="session")
def migrated_db_url() -> Iterator[str]:
    """Rebuild the test database schema from scratch once per test session."""
    if not TEST_DATABASE_URL:
        pytest.skip("TEST_DATABASE_URL not set")
    previous = os.environ.get("DATABASE_URL")
    os.environ["DATABASE_URL"] = TEST_DATABASE_URL
    get_settings.cache_clear()
    try:
        command.downgrade(alembic_config(), "base")
        command.upgrade(alembic_config(), "head")
    finally:
        if previous is None:
            os.environ.pop("DATABASE_URL")
        else:
            os.environ["DATABASE_URL"] = previous
        get_settings.cache_clear()
    yield TEST_DATABASE_URL


@pytest.fixture
async def db(migrated_db_url: str) -> AsyncIterator[AsyncSession]:
    """Session inside an outer transaction that is rolled back after each test.
    Service-level commits become savepoint releases, so tests stay isolated."""
    engine = create_async_engine(migrated_db_url)
    async with engine.connect() as connection:
        transaction = await connection.begin()
        session = AsyncSession(
            bind=connection, join_transaction_mode="create_savepoint", expire_on_commit=False
        )
        try:
            yield session
        finally:
            await session.close()
            await transaction.rollback()
    await engine.dispose()


@pytest.fixture
def db_app(app: FastAPI, db: AsyncSession) -> FastAPI:
    async def _test_db() -> AsyncIterator[AsyncSession]:
        yield db

    app.dependency_overrides[get_db] = _test_db
    return app


@pytest.fixture
async def api(db_app: FastAPI) -> AsyncIterator[AsyncClient]:
    async with AsyncClient(transport=ASGITransport(app=db_app), base_url="http://test") as ac:
        yield ac
