import uuid

from pydantic import BaseModel, ConfigDict


class Schema(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Page[T](Schema):
    items: list[T]
    total: int
    page: int
    page_size: int


class DistrictOut(Schema):
    id: int
    slug: str
    name_en: str
    name_ru: str


class ImageOut(Schema):
    id: uuid.UUID
    # Large variant (max 1600 px) and thumbnail (max 480 px), both WebP.
    url: str
    thumb_url: str
    width: int
    height: int
