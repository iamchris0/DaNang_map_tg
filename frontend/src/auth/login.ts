import { apiFetch } from '@/api/client';
import type { AuthResponse } from '@/api/types';

let loginPromise: Promise<AuthResponse> | null = null;

/** One Telegram login per page load, even under StrictMode's double effects. */
export function loginWithTelegram(initData: string): Promise<AuthResponse> {
  loginPromise ??= apiFetch<AuthResponse>('/api/auth/telegram', {
    method: 'POST',
    json: { init_data: initData },
  });
  return loginPromise;
}

/** Tests only. */
export function resetLoginForTests(): void {
  loginPromise = null;
}
