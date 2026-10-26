"""Run the bot (long polling): `python -m app.bot`.

Separate process from the API so either can restart independently. Channel posts are sent
by the API itself; this process handles conversations with users and stores the role each
user picks in the shared database.
"""

import asyncio
import logging

from aiogram import Bot, Dispatcher
from aiogram.types import BotCommand, MenuButtonWebApp, WebAppInfo

from app.bot.handlers import TEXTS, build_router, mini_app_url
from app.core.config import get_settings
from app.core.logging import configure_logging
from app.db.session import get_engine, get_sessionmaker
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

    # Command menu, translated for Russian- and Vietnamese-language clients.
    for language in Language:
        texts = TEXTS[language]
        await bot.set_my_commands(
            [
                BotCommand(command="start", description=texts["cmd_start"]),
                BotCommand(command="role", description=texts["cmd_role"]),
                BotCommand(command="language", description=texts["cmd_language"]),
            ],
            language_code=None if language is Language.EN else language.value,
        )

    dispatcher = Dispatcher()
    dispatcher.include_router(build_router(settings, get_sessionmaker()))
    me = await bot.get_me()
    logger.info("Bot @%s started (polling)", me.username)
    try:
        await dispatcher.start_polling(bot, allowed_updates=["message", "callback_query"])
    finally:
        await get_engine().dispose()


if __name__ == "__main__":
    asyncio.run(main())
