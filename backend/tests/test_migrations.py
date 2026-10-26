"""Static migration checks that need no database (offline SQL rendering)."""

import io
from pathlib import Path

from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory

BACKEND_DIR = Path(__file__).resolve().parents[1]


def _config(buffer: io.StringIO | None = None) -> Config:
    return Config(str(BACKEND_DIR / "alembic.ini"), output_buffer=buffer)


def test_single_head() -> None:
    assert len(ScriptDirectory.from_config(_config()).get_heads()) == 1


def test_offline_upgrade_renders_expected_schema() -> None:
    buffer = io.StringIO()
    command.upgrade(_config(buffer), "head", sql=True)
    sql = buffer.getvalue()

    assert "CREATE EXTENSION IF NOT EXISTS postgis" in sql
    for table in ("users", "districts", "apartments", "apartment_images", "telegram_publications"):
        assert f"CREATE TABLE {table}" in sql
    assert "GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)) STORED" in sql
    assert "USING gist (location)" in sql
    assert "CONSTRAINT ck_apartments_publishable_fields" in sql
    assert "DEFERRABLE INITIALLY DEFERRED" in sql
    assert "CREATE UNIQUE INDEX uq_telegram_publications_active" in sql
    assert "'son-tra'" in sql


def test_offline_downgrade_renders() -> None:
    buffer = io.StringIO()
    command.downgrade(_config(buffer), "head:base", sql=True)
    assert "DROP TABLE apartments" in buffer.getvalue()
