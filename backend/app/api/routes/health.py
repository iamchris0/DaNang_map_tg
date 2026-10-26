import logging
from typing import Literal

from fastapi import APIRouter, Depends, Response, status
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.storage import check_bucket
from app.db.session import get_db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/health", tags=["health"])

CheckState = Literal["ok", "error"]


class LivenessResponse(BaseModel):
    status: Literal["ok"] = "ok"


class ReadinessResponse(BaseModel):
    status: CheckState
    database: CheckState
    postgis: CheckState
    storage: CheckState


@router.get("", response_model=LivenessResponse)
async def liveness() -> LivenessResponse:
    """Process is up. Does not touch dependencies."""
    return LivenessResponse()


@router.get("/ready", response_model=ReadinessResponse)
async def readiness(response: Response, db: AsyncSession = Depends(get_db)) -> ReadinessResponse:
    """Database, PostGIS and object storage are reachable."""
    database: CheckState = "error"
    postgis: CheckState = "error"
    storage: CheckState = "error"

    try:
        await db.execute(text("SELECT 1"))
        database = "ok"
        await db.execute(text("SELECT postgis_version()"))
        postgis = "ok"
    except Exception:
        logger.exception("Database readiness check failed")

    try:
        await run_in_threadpool(check_bucket)
        storage = "ok"
    except Exception:
        logger.exception("Storage readiness check failed")

    overall: CheckState = "ok" if database == postgis == storage == "ok" else "error"
    if overall == "error":
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return ReadinessResponse(status=overall, database=database, postgis=postgis, storage=storage)
