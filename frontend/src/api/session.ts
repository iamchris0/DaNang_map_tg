/**
 * API session token. Kept in sessionStorage so a reload inside the same Telegram webview
 * keeps the session, while closing the Mini App discards it.
 */
const STORAGE_KEY = 'dna.session';

let token: string | null = null;

function read(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function getSessionToken(): string | null {
  token ??= read();
  return token;
}

export function setSessionToken(value: string | null): void {
  token = value;
  try {
    if (value) sessionStorage.setItem(STORAGE_KEY, value);
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable: keep the in-memory token only.
  }
}
