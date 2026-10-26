from app.core.config import Settings


def image_url(settings: Settings, storage_key: str) -> str:
    """Public URL for an object in the image bucket."""
    if settings.s3_public_base_url:
        base = settings.s3_public_base_url.rstrip("/")
    elif settings.s3_endpoint_url:
        base = f"{settings.s3_endpoint_url.rstrip('/')}/{settings.s3_bucket}"
    else:
        base = f"https://{settings.s3_bucket}.s3.{settings.s3_region}.amazonaws.com"
    return f"{base}/{storage_key}"


def listing_share_url(settings: Settings, apartment_id: str) -> str:
    """Telegram deep link that opens the Mini App on this listing, with a web fallback."""
    if settings.telegram_bot_username and settings.telegram_mini_app_short_name:
        return (
            f"https://t.me/{settings.telegram_bot_username}/"
            f"{settings.telegram_mini_app_short_name}?startapp={apartment_id}"
        )
    return f"{settings.public_app_url.rstrip('/')}/apartments/{apartment_id}"
