"""Run the bot (long polling): `python -m app.bot`.

Separate process from the API so either can restart independently. Channel posts are sent
by the API itself; this process only handles conversations with users.
"""

import asyncio
import logging

from aiogram import Bot, Dispatcher
from aiogram.types import MenuButtonWebApp, WebAppInfo

from app.bot.handlers import TEXTS, build_router, mini_app_url
from app.core.config import get_settings
from app.core.logging import configure_logging
from app.models.enums import Language

logger = logging.getLogger("app.bot")


async def main() -> None:
    settings = get_settings()
    configure_logging(settings.log_level)
    token = settings.telegram_bot_token.get_secret_value()
    if not token:
        logger.error("TELEGRAM_BOT_TOKEN is not set; the bot cannot start")
        raise SystemExit(1)

    bot = Bot(token=token)
    url = mini_app_url(settings)
    if url:
        # The chat menu button opens the Mini App directly.
        await bot.set_chat_menu_button(
            menu_button=MenuButtonWebApp(
                text=TEXTS[Language.EN]["menu"], web_app=WebAppInfo(url=url)
            )
        )
    else:
        logger.warning("PUBLIC_APP_URL is not HTTPS; Mini App buttons are disabled")

    dispatcher = Dispatcher()
    dispatcher.include_router(build_router(settings))
    me = await bot.get_me()
    logger.info("Bot @%s started (polling)", me.username)
    await dispatcher.start_polling(bot, allowed_updates=["message"])


if __name__ == "__main__":
    asyncio.run(main())
