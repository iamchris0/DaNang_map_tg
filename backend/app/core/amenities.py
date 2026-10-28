"""Amenities a listing can have, by category (display order).

The frontend keeps the same list in frontend/src/features/amenities/catalog.json (labels are
translated there); tests/test_amenities.py checks the two stay identical.
"""

AMENITY_CATEGORIES: dict[str, tuple[str, ...]] = {
    "comfort": (
        "furnished",
        "air_conditioning",
        "water_heater",
        "washing_machine",
        "dryer",
        "wifi",
        "tv",
        "workspace",
    ),
    "kitchen": ("kitchen", "refrigerator", "stove", "microwave", "oven"),
    "building": (
        "elevator",
        "security",
        "pool",
        "gym",
        "car_parking",
        "motorbike_parking",
        "cleaning_service",
    ),
    "outdoor": ("balcony", "terrace", "garden", "sea_view", "river_view", "mountain_view"),
    "rules": ("pets_allowed", "smoking_allowed", "utilities_included"),
}
AMENITIES: tuple[str, ...] = tuple(key for keys in AMENITY_CATEGORIES.values() for key in keys)
_ORDER = {key: index for index, key in enumerate(AMENITIES)}

# The landlord's own additions ("Rooftop BBQ"): free text, not filterable.
MAX_CUSTOM_AMENITIES = 10
CUSTOM_AMENITY_MAX_LENGTH = 40


class UnknownAmenityError(ValueError):
    pass


def normalize_amenities(values: list[str]) -> list[str]:
    """Known keys only, without duplicates, in catalog order."""
    unknown = sorted(set(values) - _ORDER.keys())
    if unknown:
        raise UnknownAmenityError(f"Unknown amenities: {', '.join(unknown)}")
    return sorted(set(values), key=_ORDER.__getitem__)


def normalize_custom_amenities(values: list[str]) -> list[str]:
    """Trimmed, non-empty, without case-insensitive duplicates, in the order given."""
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        text = " ".join(value.split())
        if text and text.casefold() not in seen:
            seen.add(text.casefold())
            result.append(text)
    return result
