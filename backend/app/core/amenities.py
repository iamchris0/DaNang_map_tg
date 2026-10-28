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

# Names for channel posts (the app's own labels are in the frontend translations).
AMENITY_LABELS: dict[str, dict[str, str]] = {
    "en": {
        "furnished": "Furnished",
        "air_conditioning": "Air conditioning",
        "water_heater": "Water heater",
        "washing_machine": "Washing machine",
        "dryer": "Dryer",
        "wifi": "Wi-Fi",
        "tv": "TV",
        "workspace": "Workspace",
        "kitchen": "Full kitchen",
        "refrigerator": "Refrigerator",
        "stove": "Stove",
        "microwave": "Microwave",
        "oven": "Oven",
        "elevator": "Elevator",
        "security": "24/7 security",
        "pool": "Swimming pool",
        "gym": "Gym",
        "car_parking": "Car parking",
        "motorbike_parking": "Motorbike parking",
        "cleaning_service": "Cleaning service",
        "balcony": "Balcony",
        "terrace": "Terrace",
        "garden": "Garden",
        "sea_view": "Sea view",
        "river_view": "River view",
        "mountain_view": "Mountain view",
        "pets_allowed": "Pets allowed",
        "smoking_allowed": "Smoking allowed",
        "utilities_included": "Utilities included",
    },
    "ru": {
        "furnished": "Мебель",
        "air_conditioning": "Кондиционер",
        "water_heater": "Водонагреватель",
        "washing_machine": "Стиральная машина",
        "dryer": "Сушильная машина",
        "wifi": "Wi-Fi",
        "tv": "Телевизор",
        "workspace": "Рабочее место",
        "kitchen": "Полноценная кухня",
        "refrigerator": "Холодильник",
        "stove": "Плита",
        "microwave": "Микроволновка",
        "oven": "Духовка",
        "elevator": "Лифт",
        "security": "Охрана 24/7",
        "pool": "Бассейн",
        "gym": "Спортзал",
        "car_parking": "Парковка для авто",
        "motorbike_parking": "Парковка для байка",
        "cleaning_service": "Уборка",
        "balcony": "Балкон",
        "terrace": "Терраса",
        "garden": "Сад",
        "sea_view": "Вид на море",
        "river_view": "Вид на реку",
        "mountain_view": "Вид на горы",
        "pets_allowed": "Можно с животными",
        "smoking_allowed": "Можно курить",
        "utilities_included": "Коммунальные услуги включены",
    },
    "vi": {
        "furnished": "Đầy đủ nội thất",
        "air_conditioning": "Điều hòa",
        "water_heater": "Bình nóng lạnh",
        "washing_machine": "Máy giặt",
        "dryer": "Máy sấy",
        "wifi": "Wi-Fi",
        "tv": "TV",
        "workspace": "Góc làm việc",
        "kitchen": "Bếp đầy đủ",
        "refrigerator": "Tủ lạnh",
        "stove": "Bếp nấu",
        "microwave": "Lò vi sóng",
        "oven": "Lò nướng",
        "elevator": "Thang máy",
        "security": "Bảo vệ 24/7",
        "pool": "Hồ bơi",
        "gym": "Phòng gym",
        "car_parking": "Chỗ đậu ô tô",
        "motorbike_parking": "Chỗ để xe máy",
        "cleaning_service": "Dịch vụ dọn dẹp",
        "balcony": "Ban công",
        "terrace": "Sân thượng",
        "garden": "Sân vườn",
        "sea_view": "View biển",
        "river_view": "View sông",
        "mountain_view": "View núi",
        "pets_allowed": "Cho phép thú cưng",
        "smoking_allowed": "Cho phép hút thuốc",
        "utilities_included": "Đã bao gồm điện nước",
    },
}

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
