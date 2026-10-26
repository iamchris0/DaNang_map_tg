import type { WebApp } from 'telegram-web-app';

/** Install a fake Telegram WebApp object (as telegram-web-app.js would inside Telegram). */
export function installTelegram(options: { startParam?: string; languageCode?: string } = {}) {
  const backButton = {
    onClick: vi.fn(),
    offClick: vi.fn(),
    show: vi.fn(),
    hide: vi.fn(),
  };
  const webApp = {
    initData: 'query_id=1&user=%7B%22id%22%3A42%7D&auth_date=1&hash=abc',
    initDataUnsafe: {
      start_param: options.startParam,
      user: { id: 42, first_name: 'Tester', language_code: options.languageCode },
    },
    platform: 'ios',
    isVersionAtLeast: () => true,
    ready: vi.fn(),
    expand: vi.fn(),
    disableVerticalSwipes: vi.fn(),
    setHeaderColor: vi.fn(),
    setBackgroundColor: vi.fn(),
    openLink: vi.fn(),
    openTelegramLink: vi.fn(),
    HapticFeedback: { selectionChanged: vi.fn() },
    BackButton: backButton,
  };
  (window as unknown as { Telegram: { WebApp: WebApp } }).Telegram = {
    WebApp: webApp as unknown as WebApp,
  };
  return webApp;
}

export function uninstallTelegram(): void {
  delete (window as unknown as { Telegram?: unknown }).Telegram;
}
