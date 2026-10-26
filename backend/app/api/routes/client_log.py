"""Client-side error reports, so failures inside Telegram's webview (where there is no
developer console) show up in the server log."""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response, status
from pydantic import Field

from app.api.deps import AppSettings
from app.core import rate_limit
from app.schemas.common import Schema

logger = logging.getLogger("app.client")
router = APIRouter(tags=["diagnostics"])


class ClientError(Schema):
    message: Annotated[str, Field(max_length=1000)]
    source: Annotated[str | None, Field(max_length=500)] = None
    stack: Annotated[str | None, Field(max_length=4000)] = None
    url: Annotated[str | None, Field(max_length=500)] = None
    platform: Annotated[str | None, Field(max_length=100)] = None


async def _limit(request: Request, settings: AppSettings) -> None:
    client = request.client.host if request.client else "unknown"
    await rate_limit.enforce("30/minute", "client-log", client)


@router.post(
    "/client-errors",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    dependencies=[Depends(_limit)],
)
async def report_client_error(body: ClientError, request: Request) -> None:
    logger.warning(
        "Client error: %s | source=%s | url=%s | platform=%s | ua=%s\n%s",
        body.message,
        body.source,
        body.url,
        body.platform,
        request.headers.get("user-agent", "")[:200],
        body.stack or "",
    )
