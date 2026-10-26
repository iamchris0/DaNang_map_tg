/**
 * Thin wrapper around the official Telegram Mini Apps script (telegram-web-app.js, loaded in
 * index.html). Every function degrades gracefully in a regular browser.
 */
import type { WebApp } from 'telegram-web-app';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function rawWebApp(): WebApp | undefined {
  return (window as { Telegram?: { WebApp?: WebApp } }).Telegram?.WebApp;
}

/** The WebApp object, only when actually running inside Telegram (signed initData present). */
export function getWebApp(): WebApp | null {
  const webApp = rawWebApp();
  return webApp?.initData ? webApp : null;
}

export function isInTelegram(): boolean {
  return getWebApp() !== null;
}

/** Signed launch data to send to the backend. Never trusted client-side. */
export function getInitData(): string | null {
  return getWebApp()?.initData ?? null;
}

/** UI-only hint for the initial language; not used for any authorization. */
export function getLanguageHint(): string | null {
  return getWebApp()?.initDataUnsafe.user?.language_code ?? null;
}

/**
 * Listing id from a deep link: t.me/<bot>/<app>?startapp=<id> inside Telegram, or the
 * equivalent tgWebAppStartParam query parameter in a browser.
 */
export function getStartListingId(): string | null {
  const param =
    getWebApp()?.initDataUnsafe.start_param ??
    new URLSearchParams(window.location.search).get('tgWebAppStartParam');
  return param && UUID_RE.test(param) ? param.toLowerCase() : null;
}

let startParamConsumed = false;

/** The deep-linked listing id, returned only once per launch. */
export function consumeStartListingId(): string | null {
  if (startParamConsumed) return null;
  startParamConsumed = true;
  return getStartListingId();
}

/** Tests only: simulate a fresh launch. */
export function resetStartParamForTests(): void {
  startParamConsumed = false;
}

export function initTelegram(): void {
  const webApp = getWebApp();
  if (!webApp) return;
  webApp.ready();
  webApp.expand();
  // Vertical swipes would minimise the app while panning the map.
  if (webApp.isVersionAtLeast('7.7')) webApp.disableVerticalSwipes();
  if (webApp.isVersionAtLeast('6.1')) {
    webApp.setHeaderColor('bg_color');
    webApp.setBackgroundColor('bg_color');
  }
  document.documentElement.dataset.telegram = webApp.platform;
}

/** Open a contact or external URL the way the current host expects. */
export function openExternal(url: string): void {
  const webApp = getWebApp();
  const isHttp = /^https?:\/\//i.test(url);
  if (webApp && /^https:\/\/t\.me\//i.test(url)) {
    webApp.openTelegramLink(url);
  } else if (webApp && isHttp) {
    webApp.openLink(url);
  } else if (isHttp) {
    window.open(url, '_blank', 'noopener,noreferrer');
  } else {
    window.location.href = url;
  }
}

export type ShareResult = 'shared' | 'copied' | 'failed';

export async function shareLink(url: string, text: string): Promise<ShareResult> {
  const webApp = getWebApp();
  if (webApp) {
    const params = new URLSearchParams({ url, text });
    webApp.openTelegramLink(`https://t.me/share/url?${params.toString()}`);
    return 'shared';
  }
  try {
    if (typeof navigator.share === 'function') {
      await navigator.share({ url, title: text });
      return 'shared';
    }
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch {
    return 'failed';
  }
}

export function hapticSelection(): void {
  const webApp = getWebApp();
  if (webApp?.isVersionAtLeast('6.1')) webApp.HapticFeedback.selectionChanged();
}

/** Show Telegram's native back button while `onBack` is set. Returns a cleanup function. */
export function bindBackButton(onBack: () => void): () => void {
  const webApp = getWebApp();
  if (!webApp?.isVersionAtLeast('6.1')) return () => undefined;
  webApp.BackButton.onClick(onBack);
  webApp.BackButton.show();
  return () => {
    webApp.BackButton.offClick(onBack);
    webApp.BackButton.hide();
  };
}

/** Ask Telegram to confirm before closing the Mini App (e.g. while a form has unsaved changes). */
export function setClosingConfirmation(enabled: boolean): void {
  const webApp = getWebApp();
  if (!webApp?.isVersionAtLeast('6.2')) return;
  if (enabled) webApp.enableClosingConfirmation();
  else webApp.disableClosingConfirmation();
}
