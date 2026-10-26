import { createContext, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';

import { apiFetch } from '@/api/client';
import { getSessionToken, setSessionToken } from '@/api/session';
import type { AuthResponse, Language, User } from '@/api/types';
import { changeLanguage, isSupportedLanguage } from '@/i18n';
import { getInitData } from '@/telegram/webapp';

import { loginWithTelegram } from './login';

export interface AuthState {
  status: 'loading' | 'authenticated' | 'anonymous';
  user: User | null;
  /** Persist a language choice to the profile (no-op when signed out). */
  saveLanguage: (language: Language) => void;
  /** Development-only login (backend must have DEV_AUTH_ENABLED=true). */
  devLogin: (telegramUserId: number) => Promise<void>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const AuthContext = createContext<AuthState>({
  status: 'anonymous',
  user: null,
  saveLanguage: () => undefined,
  devLogin: () => Promise.resolve(),
});

/**
 * Inside Telegram, exchanges the signed initData for an API session. Outside Telegram, a
 * session token kept from earlier in this tab (e.g. dev login) is restored. Browsing works
 * without a session; admin features require one.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [initData] = useState(getInitData);
  const [status, setStatus] = useState<AuthState['status']>(() =>
    initData || getSessionToken() ? 'loading' : 'anonymous',
  );
  const [user, setUser] = useState<User | null>(null);

  const accept = useCallback((nextUser: User) => {
    // The profile language is the user's latest explicit choice (here or in the bot).
    if (isSupportedLanguage(nextUser.preferred_language)) {
      void changeLanguage(nextUser.preferred_language);
    }
    setUser(nextUser);
    setStatus('authenticated');
  }, []);

  useEffect(() => {
    let cancelled = false;
    const session: Promise<User> | null = initData
      ? loginWithTelegram(initData).then((response) => {
          setSessionToken(response.access_token);
          return response.user;
        })
      : getSessionToken()
        ? apiFetch<User>('/api/auth/me')
        : null;
    session
      ?.then((nextUser) => {
        if (!cancelled) accept(nextUser);
      })
      .catch(() => {
        if (!cancelled) setStatus('anonymous');
      });
    return () => {
      cancelled = true;
    };
  }, [initData, accept]);

  const saveLanguage = useCallback(
    (language: Language) => {
      if (!user) return;
      apiFetch<User>('/api/auth/me', { method: 'PATCH', json: { preferred_language: language } })
        .then(setUser)
        .catch(() => undefined);
    },
    [user],
  );

  const devLogin = useCallback(
    async (telegramUserId: number) => {
      const response = await apiFetch<AuthResponse>('/api/auth/dev', {
        method: 'POST',
        json: { telegram_user_id: telegramUserId },
      });
      setSessionToken(response.access_token);
      accept(response.user);
    },
    [accept],
  );

  const value = useMemo(
    () => ({ status, user, saveLanguage, devLogin }),
    [status, user, saveLanguage, devLogin],
  );
  return <AuthContext value={value}>{children}</AuthContext>;
}
