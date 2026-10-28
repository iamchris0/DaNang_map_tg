from dataclasses import dataclass, field
from decimal import Decimal
from enum import StrEnum
from typing import Annotated

from fastapi import Query

from app.api.errors import AppError
from app.core.amenities import UnknownAmenityError, normalize_amenities
from app.schemas.apartment import MAX_VND

BEDROOMS_3_PLUS = 3


class CatalogSort(StrEnum):
    NEWEST = "newest"
    PRICE_ASC = "price_asc"
    PRICE_DESC = "price_desc"


@dataclass(frozen=True, slots=True)
class BBox:
    min_lng: float
    min_lat: float
    max_lng: float
    max_lat: float

    @classmethod
    def parse(cls, raw: str) -> "BBox":
        try:
            min_lng, min_lat, max_lng, max_lat = (float(part) for part in raw.split(","))
        except ValueError as exc:
            raise _invalid("bbox", "Expected min_lng,min_lat,max_lng,max_lat") from exc
        if not (-180 <= min_lng < max_lng <= 180 and -90 <= min_lat < max_lat <= 90):
            raise _invalid("bbox", "Coordinates out of range or min >= max")
        return cls(min_lng, min_lat, max_lng, max_lat)


@dataclass(frozen=True, slots=True)
class CatalogFilters:
    min_price: int | None = None
    max_price: int | None = None
    # 0 = studio, 1, 2, and 3 meaning "3 or more".
    bedrooms: frozenset[int] = field(default_factory=frozenset)
    district_ids: frozenset[int] = field(default_factory=frozenset)
    min_area: Decimal | None = None
    max_area: Decimal | None = None
    bbox: BBox | None = None
    # The listing must have every one of these (keys from app.core.amenities).
    amenities: tuple[str, ...] = ()


def _invalid(param: str, message: str) -> AppError:
    return AppError(
        "validation_error",
        "Request validation failed",
        status_code=422,
        details=[{"loc": ["query", param], "msg": message, "type": "value_error"}],
    )


def catalog_filters(
    min_price: Annotated[int | None, Query(ge=0, le=MAX_VND)] = None,
    max_price: Annotated[int | None, Query(ge=0, le=MAX_VND)] = None,
    bedrooms: Annotated[list[int] | None, Query(description="0 = studio, 3 = 3+")] = None,
    district: Annotated[list[int] | None, Query(description="District ids")] = None,
    min_area: Annotated[Decimal | None, Query(ge=0, le=10_000)] = None,
    max_area: Annotated[Decimal | None, Query(ge=0, le=10_000)] = None,
    bbox: Annotated[
        str | None, Query(description="min_lng,min_lat,max_lng,max_lat", max_length=100)
    ] = None,
    amenities: Annotated[
        list[str] | None, Query(description="Amenity keys; listings must have all of them")
    ] = None,
) -> CatalogFilters:
    if min_price is not None and max_price is not None and min_price > max_price:
        raise _invalid("min_price", "min_price must not exceed max_price")
    if min_area is not None and max_area is not None and min_area > max_area:
        raise _invalid("min_area", "min_area must not exceed max_area")
    bedroom_set = frozenset(bedrooms or ())
    if any(not 0 <= value <= BEDROOMS_3_PLUS for value in bedroom_set):
        raise _invalid("bedrooms", "bedrooms values must be 0, 1, 2 or 3 (3+)")
    if len(district or ()) > 20:
        raise _invalid("district", "Too many districts")
    try:
        amenity_keys = tuple(normalize_amenities(amenities or []))
    except UnknownAmenityError as exc:
        raise _invalid("amenities", str(exc)) from exc
    return CatalogFilters(
        min_price=min_price,
        max_price=max_price,
        bedrooms=bedroom_set,
        district_ids=frozenset(district or ()),
        min_area=min_area,
        max_area=max_area,
        bbox=BBox.parse(bbox) if bbox else None,
        amenities=amenity_keys,
    )
