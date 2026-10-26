import uuid

from pydantic import Field

from app.schemas.common import Schema


class ImageOrderUpdate(Schema):
    image_ids: list[uuid.UUID] = Field(min_length=1, max_length=50)
