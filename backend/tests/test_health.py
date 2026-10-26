from collections.abc import AsyncIterator
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import FastAPI
from httpx import AsyncClient

from app.api.routes import health
from app.db.session import get_db


def _override_db(app: FastAPI, execute: AsyncMock) -> None:
    session = MagicMock()
    session.execute = execute

    async def fake_db() -> AsyncIterator[Any]:
        yield session

    app.dependency_overrides[get_db] = fake_db


async def test_liveness(client: AsyncClient) -> None:
    response = await client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


async def test_readiness_ok(
    app: FastAPI, client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _override_db(app, AsyncMock())
    monkeypatch.setattr(health, "check_bucket", lambda: None)

    response = await client.get("/api/health/ready")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "ok", "postgis": "ok", "storage": "ok"}


async def test_readiness_reports_failures(
    app: FastAPI, client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _override_db(app, AsyncMock(side_effect=[None, RuntimeError("no postgis")]))

    def broken_bucket() -> None:
        raise RuntimeError("s3 down")

    monkeypatch.setattr(health, "check_bucket", broken_bucket)

    response = await client.get("/api/health/ready")

    assert response.status_code == 503
    assert response.json() == {
        "status": "error",
        "database": "ok",
        "postgis": "error",
        "storage": "error",
    }


async def test_unknown_route_uses_error_envelope(client: AsyncClient) -> None:
    response = await client.get("/api/does-not-exist")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"
